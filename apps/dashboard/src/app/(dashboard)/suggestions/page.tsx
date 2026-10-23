'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { CheckCircle2, XCircle, Edit3, Save, RotateCcw, Loader2, MessageSquare, User, Bot, ChevronLeft, ChevronRight } from 'lucide-react'

interface Suggestion {
  id: string
  brandId: string
  conversationId: string
  userMessage: string
  humanReply: string
  aiSuggestion: string
  humanCorrection: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  brand: { name: string; slug: string }
}

interface Counts { pending: number; approved: number; rejected: number; total: number }

const STATUS_TABS = [
  { key: 'pending', label: 'Pending Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
]

export default function SuggestionsPage() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [items, setItems] = useState<Suggestion[]>([])
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, total: 0 })
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [acting, setActing] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, countData] = await Promise.all([
        api.get(`/whatsapp/suggested-replies?status=${status}&page=${page}`),
        api.get('/whatsapp/suggested-replies/counts'),
      ])
      setItems(data.items)
      setPages(data.pages)
      setCounts(countData)
    } finally {
      setLoading(false)
    }
  }, [status, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [status])

  async function approve(id: string) {
    setActing(a => ({ ...a, [id]: true }))
    try {
      const humanCorrection = editing[id]?.trim() || undefined
      await api.post(`/whatsapp/suggested-replies/${id}/approve`, { humanCorrection })
      setItems(prev => prev.filter(s => s.id !== id))
      setCounts(c => ({ ...c, pending: Math.max(0, c.pending - 1), approved: c.approved + 1 }))
    } finally {
      setActing(a => ({ ...a, [id]: false }))
    }
  }

  async function reject(id: string) {
    setActing(a => ({ ...a, [id]: true }))
    try {
      await api.post(`/whatsapp/suggested-replies/${id}/reject`, {})
      setItems(prev => prev.filter(s => s.id !== id))
      setCounts(c => ({ ...c, pending: Math.max(0, c.pending - 1), rejected: c.rejected + 1 }))
    } finally {
      setActing(a => ({ ...a, [id]: false }))
    }
  }

  function startEdit(item: Suggestion) {
    setEditing(e => ({ ...e, [item.id]: item.humanCorrection ?? item.aiSuggestion }))
  }

  function cancelEdit(id: string) {
    setEditing(e => { const n = { ...e }; delete n[id]; return n })
  }

  const isEditing = (id: string) => id in editing

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">AI Suggested Replies</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          While in Learn mode, the AI studies each human reply and suggests improvements.
          Review, correct if needed, then approve — approved replies train the AI for Active mode.
        </p>
      </div>

      {/* Status tabs with counts */}
      <div className="flex items-center gap-1 border-b border-gray-100">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2 ${
              status === tab.key
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              status === tab.key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {(counts as any)[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading suggestions...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {status} suggestions yet.</p>
          {status === 'pending' && (
            <p className="text-xs mt-1">Enable Learn mode and let your team handle some chats — the AI will study and suggest improvements.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="card p-5 space-y-4">
              {/* Brand + date */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  {item.brand.name}
                </span>
                <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</span>
              </div>

              {/* Customer message */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={13} className="text-blue-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1 font-medium">Customer</div>
                  <div className="text-sm text-gray-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    {item.userMessage}
                  </div>
                </div>
              </div>

              {/* Human reply */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={13} className="text-gray-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-1 font-medium">Human agent replied</div>
                  <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    {item.humanReply}
                  </div>
                </div>
              </div>

              {/* AI suggestion / editable correction */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={13} className="text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-400 font-medium">AI suggested improvement</div>
                    {status === 'pending' && !isEditing(item.id) && (
                      <button
                        onClick={() => startEdit(item)}
                        className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                      >
                        <Edit3 size={11} /> Edit
                      </button>
                    )}
                    {isEditing(item.id) && (
                      <button
                        onClick={() => cancelEdit(item.id)}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                      >
                        <RotateCcw size={11} /> Reset
                      </button>
                    )}
                  </div>

                  {isEditing(item.id) ? (
                    <textarea
                      className="w-full text-sm border border-purple-300 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-purple-50 resize-none"
                      rows={3}
                      value={editing[item.id]}
                      onChange={e => setEditing(ed => ({ ...ed, [item.id]: e.target.value }))}
                      placeholder="Edit the AI suggestion..."
                    />
                  ) : (
                    <div className={`text-sm rounded-xl px-3 py-2 border ${
                      item.status === 'approved'
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : item.status === 'rejected'
                        ? 'bg-red-50 border-red-100 text-red-700 line-through opacity-60'
                        : 'bg-purple-50 border-purple-100 text-purple-900'
                    }`}>
                      {item.humanCorrection || item.aiSuggestion}
                    </div>
                  )}

                  {item.humanCorrection && !isEditing(item.id) && (
                    <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Edit3 size={10} /> Human-corrected version
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {status === 'pending' && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                  <button
                    onClick={() => approve(item.id)}
                    disabled={acting[item.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {acting[item.id] ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    {isEditing(item.id) ? 'Save & Approve' : 'Approve'}
                  </button>
                  <button
                    onClick={() => reject(item.id)}
                    disabled={acting[item.id]}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition disabled:opacity-50 border border-red-100"
                  >
                    <XCircle size={12} /> Reject
                  </button>
                  <span className="text-xs text-gray-400 ml-auto">
                    {isEditing(item.id) ? 'Editing — approve will save your version' : 'Approve to add to AI training'}
                  </span>
                </div>
              )}

              {status === 'approved' && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 pt-1 border-t border-gray-50">
                  <CheckCircle2 size={12} /> Added to AI training data
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-500">Page {page} of {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
