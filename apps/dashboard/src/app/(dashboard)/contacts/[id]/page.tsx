'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import { ArrowLeft, Phone, Tag, StickyNote, UserX, UserCheck, Save, Plus, X, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Contact {
  id: string
  name?: string
  phone: string
  isBlocked: boolean
  tags: string[]
  notes?: string
  firstSeenAt: string
  lastSeenAt: string
  brand: { name: string }
  conversations: {
    id: string
    status: string
    openedAt: string
    brand: { name: string; slug: string }
    messages: { content: string; direction: string }[]
    _count: { messages: number }
  }[]
}

export default function ContactProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [contact, setContact] = useState<Contact | null>(null)
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [saving, setSaving] = useState(false)
  const [blocking, setBlocking] = useState(false)

  async function load() {
    const data = await api.get(`/contacts/${id}`)
    setContact(data)
    setNotes(data.notes || '')
    setTags(data.tags || [])
  }

  useEffect(() => { load() }, [id])

  async function save() {
    setSaving(true)
    await api.patch(`/contacts/${id}`, { notes, tags })
    setSaving(false)
  }

  async function toggleBlock() {
    if (!contact) return
    const msg = contact.isBlocked ? 'Unblock this contact?' : 'Block this contact? They will no longer receive AI replies.'
    if (!confirm(msg)) return
    setBlocking(true)
    const res = await api.post(`/contacts/${id}/block`, {})
    setContact((c) => c ? { ...c, isBlocked: res.isBlocked } : c)
    setBlocking(false)
  }

  function addTag() {
    const t = newTag.trim()
    if (!t || tags.includes(t)) return
    setTags((prev) => [...prev, t])
    setNewTag('')
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t))
  }

  if (!contact) return <div className="p-6 text-gray-400 text-sm">Loading...</div>

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/contacts" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5">
        <ArrowLeft size={14} /> Back to Contacts
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700">
              {(contact.name || contact.phone)[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{contact.name || contact.phone}</h1>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                <Phone size={13} /> {contact.phone}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                First seen {format(new Date(contact.firstSeenAt), 'MMM d, yyyy')} · Last active {formatDistanceToNow(new Date(contact.lastSeenAt), { addSuffix: true })}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${contact.isBlocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {contact.isBlocked ? 'Blocked' : 'Active'}
            </span>
            <button
              onClick={toggleBlock}
              disabled={blocking}
              className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition font-medium ${contact.isBlocked ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
            >
              {contact.isBlocked ? <><UserCheck size={12} /> Unblock</> : <><UserX size={12} /> Block</>}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tags */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Tag size={15} /> Tags</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-1 text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-red-500 ml-0.5"><X size={11} /></button>
              </span>
            ))}
            {tags.length === 0 && <span className="text-sm text-gray-400">No tags yet</span>}
          </div>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder='Add tag e.g. "VIP", "Repeat buyer"'
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
            />
            <button onClick={addTag} className="btn-secondary px-3"><Plus size={14} /></button>
          </div>
        </div>

        {/* Notes */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><StickyNote size={15} /> Internal Notes</h2>
          <textarea
            className="input w-full min-h-[100px] resize-none text-sm"
            placeholder="Add internal notes about this contact (not visible to customer)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* Save button */}
      <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
        <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
      </button>

      {/* Conversation history */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><MessageSquare size={15} /> Conversation History ({contact.conversations.length})</h2>
        {contact.conversations.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">No conversations yet</div>
        ) : (
          <div className="space-y-3">
            {contact.conversations.map((conv) => (
              <div key={conv.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{conv.brand.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      conv.status === 'OPEN' ? 'bg-green-100 text-green-700' :
                      conv.status === 'RESOLVED' ? 'bg-gray-100 text-gray-500' :
                      'bg-orange-100 text-orange-700'
                    }`}>{conv.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{conv._count.messages} messages</span>
                    <span>{format(new Date(conv.openedAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
                {conv.messages[0] && (
                  <p className="text-sm text-gray-500 truncate">{conv.messages[0].content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
