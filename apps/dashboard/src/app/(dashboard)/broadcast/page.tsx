'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Send, Users, CheckSquare, Square, Search, Megaphone, CheckCircle2, AlertTriangle, Clock, Trash2, Calendar } from 'lucide-react'

interface Brand { id: string; name: string }
interface Contact { id: string; name?: string; phone: string; whatsappJid: string; lastSeenAt: string }
interface ScheduledBroadcast { id: string; message: string; contactIds: string[]; scheduledAt: string; status: string }

type SendMode = 'now' | 'schedule'

export default function BroadcastPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [sendMode, setSendMode] = useState<SendMode>('now')
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduled, setScheduled] = useState<ScheduledBroadcast[]>([])

  useEffect(() => {
    api.get('/brands').then(setBrands)
  }, [])

  useEffect(() => {
    if (!selectedBrand) { setContacts([]); setSelectedIds(new Set()); setScheduled([]); return }
    setLoadingContacts(true)
    api.get(`/broadcast/contacts/${selectedBrand}`)
      .then((data) => { setContacts(data); setSelectedIds(new Set()) })
      .finally(() => setLoadingContacts(false))
    api.get(`/broadcast/scheduled/${selectedBrand}`).then(setScheduled).catch(() => {})
  }, [selectedBrand])

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase()
    return !q || c.phone.includes(q) || (c.name || '').toLowerCase().includes(q)
  })

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)))
    }
  }

  async function send() {
    if (!message.trim() || selectedIds.size === 0) return

    if (sendMode === 'schedule') {
      if (!scheduleAt) return alert('Pick a date and time to schedule')
      if (new Date(scheduleAt) <= new Date()) return alert('Scheduled time must be in the future')
      if (!confirm(`Schedule broadcast to ${selectedIds.size} contacts at ${new Date(scheduleAt).toLocaleString()}?`)) return
      setSending(true)
      try {
        await api.post('/broadcast/schedule', { brandId: selectedBrand, contactIds: Array.from(selectedIds), message, scheduledAt: scheduleAt })
        setResult({ type: 'success', text: `✅ Broadcast scheduled for ${new Date(scheduleAt).toLocaleString()}` })
        setMessage(''); setSelectedIds(new Set()); setScheduleAt('')
        api.get(`/broadcast/scheduled/${selectedBrand}`).then(setScheduled).catch(() => {})
      } catch (err: any) {
        setResult({ type: 'error', text: `❌ ${err.message}` })
      } finally { setSending(false) }
      return
    }

    if (!confirm(`Send this message to ${selectedIds.size} contact${selectedIds.size > 1 ? 's' : ''}?`)) return
    setSending(true)
    setResult(null)
    try {
      const res = await api.post('/broadcast/send', { brandId: selectedBrand, contactIds: Array.from(selectedIds), message })
      setResult({ type: 'success', text: `✅ ${res.message}` })
      setMessage(''); setSelectedIds(new Set())
    } catch (err: any) {
      setResult({ type: 'error', text: `❌ ${err.message}` })
    } finally { setSending(false) }
  }

  async function cancelScheduled(id: string) {
    await api.delete(`/broadcast/scheduled/${id}`)
    setScheduled((prev) => prev.filter((s) => s.id !== id))
  }

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length
  const brandName = brands.find((b) => b.id === selectedBrand)?.name

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Megaphone size={20} /> Broadcast</h1>
        <p className="text-sm text-gray-500 mt-0.5">Send a message to multiple contacts from a specific brand</p>
      </div>

      {/* Info */}
      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-800 flex gap-2">
        <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">You're covered.</span> Every contact here messaged you first, making them opted-in under WhatsApp's policy — broadcasting back to them is completely legitimate. A small delay is added between sends as a best practice.
        </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Contact picker */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users size={16} /> {brandName} Contacts
                {contacts.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{contacts.length}</span>
                )}
              </h2>
              {contacts.length > 0 && (
                <button onClick={toggleAll} className="text-xs text-blue-600 font-medium hover:text-blue-800 flex items-center gap-1">
                  {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>

            {/* Search */}
            {contacts.length > 5 && (
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-8 text-sm"
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            {loadingContacts ? (
              <p className="text-sm text-gray-400 text-center py-6">Loading contacts...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                {contacts.length === 0 ? 'No contacts yet for this brand' : 'No contacts match your search'}
              </p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleOne(c.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${selectedIds.has(c.id) ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50 border border-transparent'}`}
                  >
                    <div className={`shrink-0 ${selectedIds.has(c.id) ? 'text-green-600' : 'text-gray-300'}`}>
                      {selectedIds.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{c.name || c.phone}</div>
                      {c.name && <div className="text-xs text-gray-400">{c.phone}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="mt-3 pt-3 border-t text-xs text-green-700 font-medium">
                {selectedIds.size} contact{selectedIds.size > 1 ? 's' : ''} selected
              </div>
            )}
          </div>

          {/* Message composer */}
          <div className="card p-5 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Send size={16} /> Message</h2>

            {/* Send mode toggle */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit text-sm">
              <button onClick={() => setSendMode('now')} className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${sendMode === 'now' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                <Send size={13} /> Send Now
              </button>
              <button onClick={() => setSendMode('schedule')} className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${sendMode === 'schedule' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                <Clock size={13} /> Schedule
              </button>
            </div>

            {sendMode === 'schedule' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Send at</label>
                <input type="datetime-local" className="input text-sm" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} />
              </div>
            )}

            <textarea
              className="input min-h-[150px] resize-none text-sm flex-1"
              placeholder="Type your broadcast message here...&#10;&#10;You can use line breaks and emojis 👋"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>{message.length} characters</span>
              {selectedIds.size > 0 && <span>Will send to {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''}</span>}
            </div>

            {result && (
              <div className={`flex items-start gap-2 text-sm px-3 py-2 rounded-lg ${result.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {result.type === 'success' ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
                {result.text}
              </div>
            )}

            <button
              onClick={send}
              disabled={sending || selectedIds.size === 0 || !message.trim()}
              className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendMode === 'schedule' ? <Clock size={15} /> : <Send size={15} />}
              {sending ? (sendMode === 'schedule' ? 'Scheduling...' : 'Sending...') : sendMode === 'schedule' ? `Schedule for ${selectedIds.size || 0} contact${selectedIds.size !== 1 ? 's' : ''}` : `Send to ${selectedIds.size || 0} contact${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

          {/* Scheduled broadcasts */}
          {scheduled.filter((s) => s.status === 'PENDING').length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Calendar size={16} /> Scheduled Broadcasts</h2>
              <div className="space-y-2">
                {scheduled.filter((s) => s.status === 'PENDING').map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-4 px-3 py-2.5 bg-gray-50 rounded-lg text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 truncate">{s.message}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <Clock size={10} className="inline mr-1" />
                        {new Date(s.scheduledAt).toLocaleString()} · {s.contactIds.length} contacts
                      </div>
                    </div>
                    <button onClick={() => cancelScheduled(s.id)} className="text-red-400 hover:text-red-600 shrink-0" title="Cancel">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
