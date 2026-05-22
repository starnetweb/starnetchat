'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { MessageSquare, Users, CheckCircle2, TrendingUp, RefreshCw, BarChart3 } from 'lucide-react'

interface Analytics {
  totals: {
    conversations: number
    openConversations: number
    resolvedConversations: number
    messages: number
    contacts: number
    newContactsThisWeek: number
    conversationsThisWeek: number
  }
  dailyMessages: { date: string; inbound: number; outbound: number }[]
  brandBreakdown: { brand: string; conversations: number }[]
}

interface Brand { id: string; name: string }

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: number; sub?: string; icon: any; color: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value.toLocaleString()}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
}

// Simple bar chart using pure CSS/HTML (no external chart library needed)
function BarChart({ data }: { data: { date: string; inbound: number; outbound: number }[] }) {
  const max = Math.max(...data.map((d) => d.inbound + d.outbound), 1)
  const last14 = data.slice(-14)

  return (
    <div className="flex items-end gap-1 h-32">
      {last14.map((d) => {
        const total = d.inbound + d.outbound
        const heightPct = (total / max) * 100
        const inboundPct = total ? (d.inbound / total) * 100 : 50
        return (
          <div key={d.date} className="flex-1 flex flex-col justify-end group relative" title={`${d.date}\nInbound: ${d.inbound}\nOutbound: ${d.outbound}`}>
            <div style={{ height: `${Math.max(heightPct, 2)}%` }} className="rounded-t-sm overflow-hidden flex flex-col-reverse">
              <div style={{ height: `${inboundPct}%` }} className="bg-green-500" />
              <div style={{ height: `${100 - inboundPct}%` }} className="bg-blue-400" />
            </div>
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
              {d.date.slice(5)}: {d.inbound}↓ {d.outbound}↑
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function AnalyticsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.get('/brands').then(setBrands) }, [])

  async function load() {
    setLoading(true)
    const url = selectedBrand ? `/analytics?brandId=${selectedBrand}` : '/analytics'
    const result = await api.get(url).catch(() => null)
    setData(result)
    setLoading(false)
  }

  useEffect(() => { load() }, [selectedBrand])

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 size={20} /> Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of conversations, messages and contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="input w-48 text-sm">
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Conversations" value={data.totals.conversations} sub={`${data.totals.conversationsThisWeek} this week`} icon={MessageSquare} color="bg-green-100 text-green-700" />
            <StatCard label="Open Now" value={data.totals.openConversations} icon={TrendingUp} color="bg-blue-100 text-blue-700" />
            <StatCard label="Resolved" value={data.totals.resolvedConversations} icon={CheckCircle2} color="bg-gray-100 text-gray-600" />
            <StatCard label="Total Contacts" value={data.totals.contacts} sub={`+${data.totals.newContactsThisWeek} this week`} icon={Users} color="bg-purple-100 text-purple-700" />
          </div>

          {/* Daily messages chart */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Messages — Last 14 Days</h2>
            <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Inbound</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" /> Outbound</span>
            </div>
            <BarChart data={data.dailyMessages} />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{data.dailyMessages.slice(-14)[0]?.date.slice(5)}</span>
              <span>Today</span>
            </div>
          </div>

          {/* Brand breakdown */}
          {data.brandBreakdown.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Conversations by Brand (last 30 days)</h2>
              <div className="space-y-3">
                {data.brandBreakdown
                  .sort((a, b) => b.conversations - a.conversations)
                  .map((b) => {
                    const max = Math.max(...data.brandBreakdown.map((x) => x.conversations))
                    const pct = max ? (b.conversations / max) * 100 : 0
                    return (
                      <div key={b.brand}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium">{b.brand}</span>
                          <span className="text-gray-500">{b.conversations}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </>
      )}

      {loading && !data && (
        <div className="text-center py-20 text-gray-400 text-sm">Loading analytics...</div>
      )}
    </div>
  )
}
