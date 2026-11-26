'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Brain, Trash2, Loader2, MessageSquare, User, Bot, RefreshCw, TrendingUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'

interface Brand { id: string; name: string }
interface LearnedPattern {
  id: string
  brandId: string
  userMessage: string
  agentReply: string
  frequency: number
  createdAt: string
  updatedAt: string
}

const PAGE_SIZE = 15

export default function DatabasePage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [patterns, setPatterns] = useState<LearnedPattern[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/brands').then((b: Brand[]) => {
      setBrands(b)
      if (b.length > 0) setSelectedBrand(b[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!selectedBrand) return
    setLoading(true)
    try {
      const data = await api.get(`/whatsapp/learned-patterns/${selectedBrand}`)
      setPatterns(data)
    } finally {
      setLoading(false)
    }
  }, [selectedBrand])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [selectedBrand, search])

  async function deletePattern(id: string) {
    if (!confirm('Remove this learned pattern? The AI will no longer use it.')) return
    setDeleting(d => ({ ...d, [id]: true }))
    try {
      await api.delete(`/whatsapp/learned-patterns/${id}`)
      setPatterns(prev => prev.filter(p => p.id !== id))
    } finally {
      setDeleting(d => ({ ...d, [id]: false }))
    }
  }

  const filtered = patterns.filter(p =>
    !search ||
    p.userMessage.toLowerCase().includes(search.toLowerCase()) ||
    p.agentReply.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedBrandName = brands.find(b => b.id === selectedBrand)?.name ?? ''

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Brain size={22} className="text-green-600" /> AI Learning Database
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every pattern the AI has learned from your team's replies. These are injected into the AI's context when replying in Active mode.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Brain size={18} className="text-green-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{patterns.length}</div>
            <div className="text-xs text-gray-500">Learned patterns</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <TrendingUp size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {patterns.reduce((s, p) => s + p.frequency, 0)}
            </div>
            <div className="text-xs text-gray-500">Total training uses</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <TrendingUp size={18} className="text-purple-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {patterns.length > 0 ? Math.max(...patterns.map(p => p.frequency)) : 0}
            </div>
            <div className="text-xs text-gray-500">Highest frequency</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedBrand}
          onChange={e => setSelectedBrand(e.target.value)}
          className="input w-48"
        >
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search messages or replies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Patterns list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading patterns...
        </div>
      ) : paginated.length === 0 ? (
        <div className="card p-16 text-center text-gray-400">
          <Brain size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">
            {search ? 'No patterns match your search.' : `No learned patterns yet for ${selectedBrandName}.`}
          </p>
          {!search && (
            <p className="text-xs mt-1">
              Enable Learn mode and have your team reply to customers — the AI will capture those patterns here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map(p => (
            <div key={p.id} className="card p-5 space-y-3">
              {/* Meta */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    {selectedBrandName}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full font-medium">
                    <TrendingUp size={10} /> used {p.frequency}×
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  <button
                    onClick={() => deletePattern(p.id)}
                    disabled={deleting[p.id]}
                    className="text-red-400 hover:text-red-600 transition disabled:opacity-50"
                    title="Remove pattern"
                  >
                    {deleting[p.id] ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </div>

              {/* Customer message */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={12} className="text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-1 font-medium">Customer asked</div>
                  <div className="text-sm text-gray-800 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    {p.userMessage}
                  </div>
                </div>
              </div>

              {/* Learned reply */}
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={12} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="text-xs text-gray-400 mb-1 font-medium">AI learned to reply</div>
                  <div className="text-sm text-gray-800 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                    {p.agentReply}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-400">
                {filtered.length} pattern{filtered.length !== 1 ? 's' : ''}{search ? ' matching' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer link to suggestions */}
      <div className="card p-4 flex items-center justify-between bg-purple-50 border-purple-100">
        <div className="flex items-center gap-3">
          <MessageSquare size={18} className="text-purple-600" />
          <div>
            <div className="text-sm font-medium text-purple-900">AI Suggested Improvements</div>
            <div className="text-xs text-purple-600">Review and approve AI-improved replies — approved ones get added above</div>
          </div>
        </div>
        <a href="/suggestions" className="text-xs font-semibold text-purple-700 hover:text-purple-900 px-3 py-1.5 rounded-lg border border-purple-200 hover:bg-purple-100 transition">
          View Suggestions →
        </a>
      </div>
    </div>
  )
}
