'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Trash2, Edit2, Check, X, ToggleLeft, ToggleRight, Clock, MessageSquare, Zap } from 'lucide-react'

interface Brand { id: string; name: string }

interface QRMessage {
  id?: string
  body: string
  variations: string[]
  delaySeconds: number
  order: number
}

interface QuickReply {
  id: string
  name: string
  keywords: string[]
  matchType: string
  isActive: boolean
  messages: QRMessage[]
}

const emptyForm = () => ({
  name: '',
  keywords: '' as string,
  matchType: 'ANY',
  messages: [] as QRMessage[],
})

export default function QuickRepliesPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    api.get('/brands').then(setBrands)
  }, [])

  useEffect(() => {
    if (!selectedBrand) return
    api.get(`/quick-replies/${selectedBrand}`).then(setQuickReplies)
  }, [selectedBrand])

  function startEdit(qr: QuickReply) {
    setEditingId(qr.id)
    setForm({
      name: qr.name,
      keywords: qr.keywords.join(', '),
      matchType: qr.matchType,
      messages: qr.messages.map((m) => ({ ...m, variations: m.variations ?? [] })),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  function addMessage() {
    setForm((f) => ({
      ...f,
      messages: [...f.messages, { body: '', variations: [], delaySeconds: 0, order: f.messages.length }],
    }))
  }

  function removeMessage(i: number) {
    setForm((f) => ({ ...f, messages: f.messages.filter((_, idx) => idx !== i) }))
  }

  function updateMessage(i: number, field: keyof QRMessage, value: any) {
    setForm((f) => {
      const msgs = [...f.messages]
      msgs[i] = { ...msgs[i], [field]: value }
      return { ...f, messages: msgs }
    })
  }

  async function save() {
    if (!form.name.trim() || !form.keywords.trim() || !selectedBrand) return
    const msgs = form.messages.filter((m) => m.body.trim())
    if (!msgs.length) return alert('Add at least one message')
    setSaving(true)

    const payload = {
      name: form.name.trim(),
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
      matchType: form.matchType,
      messages: msgs,
    }

    if (editingId) {
      await api.put(`/quick-replies/${selectedBrand}/${editingId}`, payload)
    } else {
      await api.post(`/quick-replies/${selectedBrand}`, payload)
    }

    const updated = await api.get(`/quick-replies/${selectedBrand}`)
    setQuickReplies(updated)
    cancelForm()
    setSaving(false)
  }

  async function toggleActive(qr: QuickReply) {
    await api.patch(`/quick-replies/${selectedBrand}/${qr.id}/toggle`, {})
    const updated = await api.get(`/quick-replies/${selectedBrand}`)
    setQuickReplies(updated)
  }

  async function deleteQR(id: string) {
    if (!confirm('Delete this quick reply?')) return
    await api.delete(`/quick-replies/${selectedBrand}/${id}`)
    setQuickReplies((prev) => prev.filter((q) => q.id !== id))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Quick Replies</h1>
        <p className="text-sm text-gray-500 mt-0.5">Keyword-triggered responses that bypass AI entirely — instant predefined answers</p>
      </div>

      {/* Brand selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">Select Brand</label>
        <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="input w-64">
          <option value="">Choose a brand...</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {selectedBrand && (
        <>
          {/* How it works info */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
            <div className="font-semibold mb-1 flex items-center gap-1.5"><Zap size={14} /> How Quick Replies work</div>
            When an incoming message contains the trigger keywords, the system sends your predefined messages <strong>immediately</strong> — no AI involved. You can add multiple messages with delays between them (e.g. message 1 instantly, message 2 after 10 seconds).
          </div>

          {/* Add / Edit Form */}
          {showForm ? (
            <div className="card p-6 space-y-5">
              <h2 className="font-semibold text-gray-900">{editingId ? 'Edit' : 'New'} Quick Reply</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input className="input" placeholder='e.g. "Undergraduate Interest"' value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                  <select className="input" value={form.matchType} onChange={(e) => setForm((f) => ({ ...f, matchType: e.target.value }))}>
                    <option value="ANY">ANY keyword matches</option>
                    <option value="ALL">ALL keywords must match</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Keywords <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                <input
                  className="input"
                  placeholder='e.g. "undergraduate, interested, topic"'
                  value={form.keywords}
                  onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Keywords are case-insensitive. Match type determines if ANY or ALL keywords need to appear.</p>
              </div>

              {/* Messages */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><MessageSquare size={14} /> Reply Messages</label>
                {form.messages.length === 0 && (
                  <button onClick={addMessage} className="btn-secondary text-sm flex items-center gap-2 mb-3">
                    <Plus size={14} /> Add a message
                  </button>
                )}
                <div className="space-y-3">
                  {form.messages.map((m, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-3 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">Message {i + 1}</span>
                        {form.messages.length > 1 && (
                          <button onClick={() => removeMessage(i)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                        )}
                      </div>
                      {/* Single textarea — one variation per line, system picks randomly */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Reply <span className="text-gray-400 font-normal">(one variation per line — system picks one randomly each time)</span>
                        </label>
                        <textarea
                          className="input min-h-[130px] resize-none text-sm"
                          placeholder={"Welcome to BlazingProjects! How can I help you today?\nWelcome to BlazingProjects! What can I assist you with?\nWelcome to BlazingProjects! How may I support you today?"}
                          value={[m.body, ...m.variations].filter(Boolean).join('\n')}
                          onChange={(e) => {
                            const lines = e.target.value.split('\n')
                            setForm((f) => {
                              const msgs = [...f.messages]
                              msgs[i] = { ...msgs[i], body: lines[0] ?? '', variations: lines.slice(1).filter(Boolean) }
                              return { ...f, messages: msgs }
                            })
                          }}
                        />
                        {(m.variations.length > 0 || m.body) && (
                          <p className="text-xs text-green-600 mt-1">✓ {m.variations.length + 1} variation{m.variations.length > 0 ? 's' : ''} — picked randomly each send</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-gray-400" />
                        <label className="text-xs text-gray-500">Send after</label>
                        <input
                          type="number"
                          min={0}
                          className="input w-20 text-sm py-1"
                          value={m.delaySeconds}
                          onChange={(e) => updateMessage(i, 'delaySeconds', parseInt(e.target.value) || 0)}
                        />
                        <span className="text-xs text-gray-500">seconds {i === 0 && m.delaySeconds === 0 && <span className="text-green-600">(instant)</span>}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addMessage} className="mt-3 text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                  <Plus size={14} /> Add another message
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                  <Check size={15} /> {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Quick Reply'}
                </button>
                <button onClick={cancelForm} className="btn-secondary flex items-center gap-2">
                  <X size={15} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> New Quick Reply
            </button>
          )}

          {/* Quick Replies List */}
          {quickReplies.length > 0 ? (
            <div className="space-y-3">
              {quickReplies.map((qr) => (
                <div key={qr.id} className={`card p-5 ${!qr.isActive ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="font-semibold text-gray-900">{qr.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${qr.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {qr.isActive ? 'Active' : 'Paused'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                          Match {qr.matchType}
                        </span>
                      </div>

                      {/* Keywords */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {qr.keywords.map((k) => (
                          <span key={k} className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">{k}</span>
                        ))}
                      </div>

                      {/* Messages preview */}
                      <div className="space-y-1.5">
                        {qr.messages.map((m, i) => (
                          <div key={m.id || i} className="flex items-start gap-2 text-sm">
                            <span className="text-xs text-gray-400 mt-0.5 shrink-0">
                              {m.delaySeconds === 0 ? 'Instant' : `+${m.delaySeconds}s`}
                            </span>
                            <p className="text-gray-700 line-clamp-2">{m.body}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => toggleActive(qr)} title={qr.isActive ? 'Pause' : 'Activate'} className="text-gray-400 hover:text-gray-600">
                        {qr.isActive ? <ToggleRight size={22} className="text-green-500" /> : <ToggleLeft size={22} />}
                      </button>
                      <button onClick={() => startEdit(qr)} className="text-blue-500 hover:text-blue-700"><Edit2 size={16} /></button>
                      <button onClick={() => deleteQR(qr.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : !showForm && (
            <div className="card p-10 text-center text-gray-400 text-sm">
              No quick replies yet. Create one above to get started.
            </div>
          )}
        </>
      )}
    </div>
  )
}
