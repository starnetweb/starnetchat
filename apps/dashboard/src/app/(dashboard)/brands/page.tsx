'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { QRCodeSVG } from 'qrcode.react'
import { Wifi, WifiOff, RefreshCw, Zap, MessageSquare, CheckCircle2, Bot, BotOff, X, Save, Settings } from 'lucide-react'

interface Brand {
  id: string
  name: string
  slug: string
  keywords: string[]
  isActive: boolean
  systemPrompt?: string
  _count?: { conversations: number }
}

interface WAStatus {
  status: string
  connected: boolean
  qr?: string
}

const BRAND_COLORS: Record<string, string> = {
  'blazingprojects': 'bg-orange-100 text-orange-700',
  'examkits': 'bg-blue-100 text-blue-700',
  'watmall': 'bg-purple-100 text-purple-700',
  'payapp': 'bg-green-100 text-green-700',
  'realtour': 'bg-teal-100 text-teal-700',
  'stanet-academy': 'bg-indigo-100 text-indigo-700',
}

const BRAND_AVATARS: Record<string, string> = {
  'blazingprojects': '🔥',
  'examkits': '📚',
  'watmall': '🛒',
  'payapp': '💳',
  'realtour': '🏠',
  'stanet-academy': '💻',
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [wa, setWa] = useState<WAStatus>({ status: 'DISCONNECTED', connected: false })
  const [connecting, setConnecting] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [togglingAi, setTogglingAi] = useState(false)

  // Edit modal state
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)
  const [editName, setEditName] = useState('')
  const [editSystemPrompt, setEditSystemPrompt] = useState('')
  const [editKeywords, setEditKeywords] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  async function refreshWA() {
    const status = await api.get('/whatsapp/status').catch(() => ({ status: 'DISCONNECTED', connected: false }))
    if (status.status === 'QR_READY') {
      const qrRes = await api.get('/whatsapp/qr').catch(() => ({ qr: null }))
      setWa({ ...status, qr: qrRes.qr })
    } else {
      setWa(status)
    }
  }

  useEffect(() => {
    api.get('/brands').then(setBrands).catch(() => {})
    api.get('/whatsapp/ai-status').then((r) => setAiEnabled(r.aiEnabled)).catch(() => {})
    refreshWA()
    const interval = setInterval(refreshWA, 4000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (wa.connected || wa.status === 'DISCONNECTED') {
      api.get('/brands').then(setBrands).catch(() => {})
    }
  }, [wa.status])

  async function handleConnect() {
    setConnecting(true)
    await api.post('/whatsapp/connect', {}).catch(() => {})
    setTimeout(() => { refreshWA(); setConnecting(false) }, 2000)
  }

  async function handleDisconnect() {
    await api.post('/whatsapp/disconnect', {})
    refreshWA()
  }

  async function handleAiToggle() {
    setTogglingAi(true)
    const result = await api.post('/whatsapp/ai-toggle', {}).catch(() => null)
    if (result) setAiEnabled(result.aiEnabled)
    setTogglingAi(false)
  }

  function openEdit(brand: Brand) {
    setEditingBrand(brand)
    setEditName(brand.name)
    setEditSystemPrompt(brand.systemPrompt || '')
    setEditKeywords(brand.keywords.join(', '))
    setEditActive(brand.isActive)
    setSaveMsg('')
  }

  function closeEdit() {
    setEditingBrand(null)
    setSaveMsg('')
  }

  async function handleSave() {
    if (!editingBrand) return
    setSaving(true)
    setSaveMsg('')
    try {
      const keywords = editKeywords.split(',').map(k => k.trim()).filter(Boolean)
      await api.patch(`/brands/${editingBrand.id}`, {
        name: editName.trim(),
        systemPrompt: editSystemPrompt.trim(),
        keywords,
        isActive: editActive,
      })
      setBrands(prev => prev.map(b => b.id === editingBrand.id
        ? { ...b, name: editName.trim(), systemPrompt: editSystemPrompt.trim(), keywords, isActive: editActive }
        : b
      ))
      setSaveMsg('Saved!')
      setTimeout(closeEdit, 800)
    } catch {
      setSaveMsg('Save failed — check API connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* WhatsApp Connection Card */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${wa.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
              WhatsApp Connection
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">One number shared across all brands — AI routes by message intent</p>
          </div>
          <span className={wa.connected ? 'badge-green' : 'badge-gray'}>
            {wa.status}
          </span>
        </div>

        {wa.status === 'QR_READY' && wa.qr && (
          <div className="flex flex-col items-center gap-3 py-6 bg-gray-50 rounded-xl mb-4">
            <p className="text-sm font-medium text-gray-700">Scan with WhatsApp on your phone</p>
            <p className="text-xs text-gray-400">WhatsApp → Linked Devices → Link a Device</p>
            <div className="p-3 bg-white rounded-xl shadow-sm border">
              <QRCodeSVG value={wa.qr} size={180} />
            </div>
            <p className="text-xs text-gray-400 animate-pulse">Waiting for scan...</p>
          </div>
        )}

        {wa.connected && (
          <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-4 py-2.5 rounded-lg mb-4">
            <CheckCircle2 size={16} />
            <span className="font-medium">Connected and receiving messages</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          {!wa.connected ? (
            <button onClick={handleConnect} disabled={connecting} className="btn-primary">
              <Wifi size={15} />
              {connecting ? 'Connecting...' : 'Connect WhatsApp'}
            </button>
          ) : (
            <button onClick={handleDisconnect} className="btn-danger">
              <WifiOff size={15} /> Disconnect
            </button>
          )}
          <button onClick={refreshWA} className="btn-secondary">
            <RefreshCw size={14} /> Refresh
          </button>

          {/* AI Toggle */}
          <div className="ml-auto flex items-center gap-3">
            <div className={`text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 ${aiEnabled ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {aiEnabled ? <Bot size={13} /> : <BotOff size={13} />}
              {aiEnabled ? 'AI Active' : 'Human Mode'}
            </div>
            <button
              onClick={handleAiToggle}
              disabled={togglingAi}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${aiEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
              title={aiEnabled ? 'Click to switch to Human Mode (AI off)' : 'Click to enable AI replies'}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Brands Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">Brands ({brands.length})</h1>
          <p className="text-xs text-gray-400">Click a brand to edit its AI settings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {brands.map((brand) => {
            const colorClass = BRAND_COLORS[brand.slug] || 'bg-gray-100 text-gray-700'
            const emoji = BRAND_AVATARS[brand.slug] || '🏢'
            return (
              <div
                key={brand.id}
                onClick={() => openEdit(brand)}
                className="card p-5 hover:shadow-md hover:border-green-200 transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${colorClass}`}>
                      {emoji}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900 text-sm">{brand.name}</h2>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                        <MessageSquare size={11} />
                        {brand._count?.conversations ?? 0} conversations
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={brand.isActive ? 'badge-green' : 'badge-gray'}>
                      {brand.isActive ? 'Active' : 'Off'}
                    </span>
                    <Settings size={14} className="text-gray-300 group-hover:text-green-500 transition-colors" />
                  </div>
                </div>

                {brand.systemPrompt && (
                  <p className="text-xs text-gray-400 italic mb-2 line-clamp-1">"{brand.systemPrompt.slice(0, 60)}..."</p>
                )}

                {/* Keywords */}
                <div className="flex flex-wrap gap-1 mt-3">
                  {brand.keywords.slice(0, 4).map((kw) => (
                    <span key={kw} className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Zap size={9} className="text-yellow-500" /> {kw}
                    </span>
                  ))}
                  {brand.keywords.length > 4 && (
                    <span className="text-xs text-gray-400 px-2 py-0.5">+{brand.keywords.length - 4} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit Modal */}
      {editingBrand && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">
                Edit — {BRAND_AVATARS[editingBrand.slug] || '🏢'} {editingBrand.name}
              </h2>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <input
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Active</div>
                  <div className="text-xs text-gray-400">AI will respond to messages for this brand</div>
                </div>
                <button
                  onClick={() => setEditActive(!editActive)}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${editActive ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${editActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Keywords */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                <p className="text-xs text-gray-400 mb-1.5">Comma-separated. Used to route messages to this brand.</p>
                <input
                  className="input"
                  value={editKeywords}
                  onChange={(e) => setEditKeywords(e.target.value)}
                  placeholder="e.g. project, research, assignment"
                />
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">AI System Prompt</label>
                <p className="text-xs text-gray-400 mb-1.5">
                  Instructions for how the AI should behave for this brand — tone, formatting, what to say/avoid.
                </p>
                <textarea
                  className="input min-h-[180px] resize-none text-sm"
                  value={editSystemPrompt}
                  onChange={(e) => setEditSystemPrompt(e.target.value)}
                  placeholder={`e.g. You are a helpful assistant for BlazingProjects, an academic research platform.\n\nFormatting rules:\n- Do NOT use asterisks around list items\n- Only bold the brand name: *BlazingProjects*\n- Keep replies concise and friendly\n- Never discuss competitor platforms`}
                />
              </div>

              {saveMsg && (
                <p className={`text-sm font-medium ${saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>
                  {saveMsg}
                </p>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={closeEdit} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
                <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
