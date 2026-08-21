'use client'
import { useEffect, useRef, useState } from 'react'
import { useSocket } from '@/lib/socket'
import { formatDistanceToNow } from 'date-fns'
import { Send, CheckCheck, StickyNote, Save, X, User, Paperclip, FileText, Bot, BotOff, FileSearch, Star, Tag, RefreshCw } from 'lucide-react'
import Link from 'next/link'

import { api } from '@/lib/api'

// Use raw fetch for multipart — api helper only does JSON
function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('wac_token')
}

interface Conversation {
  id: string
  status: string
  updatedAt: string
  notes?: string
  contact: { id: string; name?: string; phone: string }
  brand: { name: string; slug: string }
  messages: { content: string; direction: string }[]
  _count: { messages: number }
}

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  sentAt: string
  isRead: boolean
}

export default function ChatsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [csatSending, setCsatSending] = useState(false)
  const [followUpState, setFollowUpState] = useState<{ loading: boolean; result: string | null }>({ loading: false, result: null })
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [attachPreview, setAttachPreview] = useState<string | null>(null)
  const [aiTyping, setAiTyping] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const socket = useSocket()

  async function loadConversations() {
    const r = await api.get('/chats/conversations')
    setConversations(r.conversations)
  }

  async function loadUnread() {
    const map = await api.get('/chats/unread').catch(() => ({}))
    setUnread(map)
  }

  useEffect(() => {
    loadConversations()
    loadUnread()
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('typing', (data: any) => {
      if (selected && data.conversationId === selected.id) setAiTyping(true)
    })
    socket.on('typing:stop', (data: any) => {
      if (selected && data.conversationId === selected.id) setAiTyping(false)
    })
    socket.on('message:new', (data: any) => {
      setAiTyping(false)
      if (selected && data.conversationId === selected.id) {
        // Re-fetch full message list so human WhatsApp replies (with all fields) display correctly
        api.get(`/chats/conversations/${selected.id}/messages`).then(setMessages).catch(() => {})
        api.post(`/chats/conversations/${selected.id}/read`, {}).catch(() => {})
      } else {
        setUnread((u) => ({ ...u, [data.conversationId]: (u[data.conversationId] || 0) + (data.direction === 'INBOUND' ? 1 : 0) }))
      }
      loadConversations()
    })
    return () => { socket.off('message:new'); socket.off('typing'); socket.off('typing:stop') }
  }, [socket, selected])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function selectConversation(conv: Conversation) {
    setSelected(conv)
    setNotes(conv.notes || '')
    setShowNotes(false)
    const msgs = await api.get(`/chats/conversations/${conv.id}/messages`)
    setMessages(msgs)
    // Mark as read
    await api.post(`/chats/conversations/${conv.id}/read`, {}).catch(() => {})
    setUnread((u) => { const n = { ...u }; delete n[conv.id]; return n })
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAttachFile(file)
    if (file.type.startsWith('image/')) {
      setAttachPreview(URL.createObjectURL(file))
    } else {
      setAttachPreview(null)
    }
  }

  function clearAttach() {
    setAttachFile(null)
    setAttachPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function sendReply() {
    if (attachFile) return sendMedia()
    if (!reply.trim() || !selected) return
    setSending(true)
    try {
      const msg = await api.post(`/chats/conversations/${selected.id}/send`, { message: reply })
      setMessages((m) => [...m, msg])
      setReply('')
    } catch (err: any) {
      alert('Failed to send: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  async function sendMedia() {
    if (!attachFile || !selected) return
    setSending(true)
    try {
      const form = new FormData()
      form.append('file', attachFile)
      if (reply.trim()) form.append('caption', reply.trim())

      const res = await fetch(`/api/chats/conversations/${selected.id}/send-media`, {
        method: 'POST',
        headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: form,
      })
      if (!res.ok) throw new Error(await res.text())
      const msg = await res.json()
      setMessages((m) => [...m, msg])
      setReply('')
      clearAttach()
    } catch (err: any) {
      alert('Failed to send: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  async function triggerFollowUp() {
    if (!confirm('Send a follow-up message to all open conversations where the customer has not replied to our last message?')) return
    setFollowUpState({ loading: true, result: null })
    try {
      const res = await api.post('/chats/trigger-followup', { hours: 1 })
      setFollowUpState({ loading: false, result: `Sent ${res.sent} follow-ups (${res.skipped} skipped)` })
      setTimeout(() => setFollowUpState({ loading: false, result: null }), 5000)
    } catch (err: any) {
      setFollowUpState({ loading: false, result: 'Error: ' + err.message })
    }
  }

  async function saveNotes() {
    if (!selected) return
    setSavingNotes(true)
    await api.patch(`/chats/conversations/${selected.id}`, { notes })
    setSavingNotes(false)
    setShowNotes(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendReply()
    }
  }

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-80 border-r bg-white flex flex-col">
        <div className="px-4 py-3 border-b flex flex-col gap-2">
          <div className="font-semibold text-gray-900 flex items-center justify-between">
            All Chats
            {Object.values(unread).some((v) => v > 0) && (
              <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                {Object.values(unread).reduce((a, b) => a + b, 0)} unread
              </span>
            )}
          </div>
          <button
            onClick={triggerFollowUp}
            disabled={followUpState.loading}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition disabled:opacity-50"
            title="Send a follow-up to all open chats where customer hasn't replied"
          >
            <RefreshCw size={11} className={followUpState.loading ? 'animate-spin' : ''} />
            {followUpState.loading ? 'Sending...' : 'Follow Up Dropped Chats'}
          </button>
          {followUpState.result && (
            <p className="text-xs text-center text-orange-600">{followUpState.result}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition ${selected?.id === c.id ? 'bg-green-50' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm truncate">{c.contact.name || c.contact.phone}</span>
                  {unread[c.id] > 0 && (
                    <span className="shrink-0 text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full leading-none">{unread[c.id]}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">
                  {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{c.brand.name}</div>
              <div className="text-xs text-gray-400 mt-1 truncate">{c.messages[0]?.content || 'No messages'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat pane */}
      <div className="flex-1 flex flex-col min-w-0">
        {selected ? (
          <>
            {/* Header */}
            <div className="px-5 py-3 bg-white border-b flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <User size={16} className="text-green-700" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-900 truncate">
                    {selected.contact.name || selected.contact.phone}
                  </div>
                  <div className="text-xs text-gray-400">{selected.brand.name} · {selected.contact.phone}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Per-conversation AI toggle */}
                <button
                  onClick={async () => {
                    const updated = await api.patch(`/chats/conversations/${selected.id}`, { aiManaged: !(selected as any).aiManaged })
                    setSelected((s: any) => ({ ...s, aiManaged: updated.aiManaged }))
                  }}
                  className={`text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 font-medium border transition ${(selected as any).aiManaged ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                  title={(selected as any).aiManaged ? 'AI is ON for this chat — click to disable' : 'AI is OFF for this chat — click to enable'}
                >
                  {(selected as any).aiManaged ? <><Bot size={12} /> AI On</> : <><BotOff size={12} /> AI Off</>}
                </button>
                <Link href={`/contacts/${selected.contact.id}`} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                  <User size={12} /> Profile
                </Link>
                <button
                  onClick={() => setShowNotes((v) => !v)}
                  className={`btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 ${showNotes ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : ''}`}
                >
                  <StickyNote size={12} /> Notes
                </button>
                <button
                  onClick={async () => {
                    setSummaryLoading(true)
                    setSummary(null)
                    const res = await api.post(`/chats/conversations/${selected.id}/summary`, {}).catch(() => null)
                    setSummary(res?.summary || 'Could not generate summary.')
                    setSummaryLoading(false)
                  }}
                  disabled={summaryLoading}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  title="Generate AI summary of this conversation"
                >
                  <FileSearch size={12} /> {summaryLoading ? '...' : 'Summary'}
                </button>
                <button
                  onClick={async () => {
                    setCsatSending(true)
                    await api.post(`/chats/conversations/${selected.id}/send-csat`, {}).catch(() => {})
                    setCsatSending(false)
                  }}
                  disabled={csatSending || (selected as any).csatSent}
                  className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  title={(selected as any).csatSent ? 'CSAT survey already sent' : 'Send satisfaction survey to customer'}
                >
                  <Star size={12} /> {(selected as any).csatSent ? `CSAT ${(selected as any).csatScore ? (selected as any).csatScore+'/5' : 'Sent'}` : 'CSAT'}
                </button>
              </div>
            </div>

            {/* Notes panel */}
            {showNotes && (
              <div className="bg-yellow-50 border-b border-yellow-100 px-5 py-3 flex gap-3 items-start">
                <textarea
                  className="flex-1 text-sm bg-white border border-yellow-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-yellow-400 min-h-[70px]"
                  placeholder="Add internal notes about this conversation (not visible to customer)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex flex-col gap-1.5">
                  <button onClick={saveNotes} disabled={savingNotes} className="text-xs bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 font-medium">
                    <Save size={11} /> {savingNotes ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setShowNotes(false)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 justify-center">
                    <X size={11} /> Close
                  </button>
                </div>
              </div>
            )}

            {/* AI Summary panel */}
            {summary && (
              <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-indigo-700 flex items-center gap-1"><FileSearch size={11} /> AI Summary</span>
                  <button onClick={() => setSummary(null)} className="text-indigo-400 hover:text-indigo-600"><X size={12} /></button>
                </div>
                <p className="text-sm text-indigo-800 whitespace-pre-line">{summary}</p>
              </div>
            )}

            {/* AI Labels */}
            {((selected as any).aiLabels?.length > 0 || (selected as any).sentiment) && (
              <div className="border-b border-gray-100 px-5 py-2 flex flex-wrap items-center gap-1.5">
                {(selected as any).sentiment && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    (selected as any).sentiment === 'angry' ? 'bg-red-100 text-red-700' :
                    (selected as any).sentiment === 'negative' ? 'bg-orange-100 text-orange-700' :
                    (selected as any).sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {(selected as any).sentiment}
                  </span>
                )}
                {((selected as any).aiLabels || []).map((label: string) => (
                  <span key={label} className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium flex items-center gap-1">
                    <Tag size={9} /> {label}
                  </span>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50">
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-sm lg:max-w-md rounded-2xl text-sm leading-relaxed overflow-hidden ${
                    m.direction === 'OUTBOUND'
                      ? 'bg-green-600 text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {/* Media rendering */}
                    {(m as any).mediaType?.startsWith('image/') && (m as any).mediaUrl && (
                      <a href={(m as any).mediaUrl} target="_blank" rel="noreferrer">
                        <img src={(m as any).mediaUrl} alt="attachment" className="max-w-full rounded-t-2xl" />
                      </a>
                    )}
                    {(m as any).mediaType?.startsWith('video/') && (m as any).mediaUrl && (
                      <video controls className="max-w-full rounded-t-2xl">
                        <source src={(m as any).mediaUrl} type={(m as any).mediaType} />
                      </video>
                    )}
                    {(m as any).mediaType && !(m as any).mediaType.startsWith('image/') && !(m as any).mediaType.startsWith('video/') && (m as any).mediaUrl && (
                      <a href={(m as any).mediaUrl} target="_blank" rel="noreferrer" className={`flex items-center gap-2 px-4 py-3 ${m.direction === 'OUTBOUND' ? 'text-green-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`}>
                        <FileText size={18} className="shrink-0" />
                        <span className="text-xs font-medium truncate">{m.content}</span>
                      </a>
                    )}
                    {/* Text / caption */}
                    {(!((m as any).mediaType) || ((m as any).mediaType && m.content && !(m as any).mediaUrl?.includes(m.content))) && (
                      <p className="whitespace-pre-wrap px-4 py-2.5">{m.content}</p>
                    )}
                    <div className={`text-xs px-4 pb-2 flex items-center gap-1 ${m.direction === 'OUTBOUND' ? 'text-green-200 justify-end' : 'text-gray-400'}`}>
                      {new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.direction === 'OUTBOUND' && <CheckCheck size={11} />}
                    </div>
                  </div>
                </div>
              ))}
              {/* AI typing indicator */}
              {aiTyping && (
                <div className="flex justify-end">
                  <div className="bg-green-600 rounded-2xl rounded-br-sm px-4 py-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            <div className="bg-white border-t px-4 py-3 space-y-2">
              {/* Attachment preview */}
              {attachFile && (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  {attachPreview
                    ? <img src={attachPreview} alt="preview" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    : <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0"><FileText size={20} className="text-blue-600" /></div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{attachFile.name}</p>
                    <p className="text-xs text-gray-400">{(attachFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={clearAttach} className="text-gray-400 hover:text-gray-600 shrink-0"><X size={16} /></button>
                </div>
              )}

              <div className="flex gap-2 items-end">
                {/* Hidden file input */}
                <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" className="hidden" onChange={handleFileSelect} />

                {/* Paperclip button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-10 h-10 border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl flex items-center justify-center transition"
                  title="Attach file"
                >
                  <Paperclip size={16} />
                </button>

                <textarea
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[44px] max-h-32"
                  placeholder={attachFile ? 'Add a caption (optional)...' : 'Type a reply... (Enter to send, Shift+Enter for new line)'}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || (!reply.trim() && !attachFile)}
                  className="shrink-0 w-10 h-10 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition"
                >
                  {sending ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation to view messages
          </div>
        )}
      </div>
    </div>
  )
}
