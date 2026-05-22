'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { QRCodeSVG } from 'qrcode.react'
import { Wifi, WifiOff, RefreshCw, Zap, MessageSquare, CheckCircle2, Bot, BotOff } from 'lucide-react'

interface Brand {
  id: string
  name: string
  slug: string
  keywords: string[]
  isActive: boolean
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

  // Reload brands when API comes back online after a crash
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {brands.map((brand) => {
            const colorClass = BRAND_COLORS[brand.slug] || 'bg-gray-100 text-gray-700'
            const emoji = BRAND_AVATARS[brand.slug] || '🏢'
            return (
              <div key={brand.id} className="card p-5 hover:shadow-md transition-shadow">
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
                  <span className={brand.isActive ? 'badge-green' : 'badge-gray'}>
                    {brand.isActive ? 'Active' : 'Off'}
                  </span>
                </div>

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
    </div>
  )
}
