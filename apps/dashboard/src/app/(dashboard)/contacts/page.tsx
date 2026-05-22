'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Search, Download, UserX, Users, Tag } from 'lucide-react'
import Link from 'next/link'

interface Brand { id: string; name: string }
interface Contact {
  id: string
  name?: string
  phone: string
  tags: string[]
  isBlocked: boolean
  lastSeenAt: string
  firstSeenAt: string
  brand: { name: string; slug: string }
  _count: { conversations: number }
}

export default function ContactsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.get('/brands').then(setBrands) }, [])

  useEffect(() => {
    setLoading(true)
    const url = selectedBrand ? `/contacts?brandId=${selectedBrand}` : '/contacts'
    api.get(url).then(setContacts).finally(() => setLoading(false))
  }, [selectedBrand])

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase()
    return !q || c.phone.includes(q) || (c.name || '').toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))
  })

  function exportCSV() {
    if (!selectedBrand) return alert('Select a brand to export')
    window.open(`/api/contacts/export/${selectedBrand}`, '_blank')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Users size={20} /> Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} total contacts</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 text-sm">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="input w-48">
          <option value="">All brands</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 w-full" placeholder="Search by name, phone or tag..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading contacts...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No contacts found</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tags</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Chats</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last seen</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${c.id}`} className="hover:text-green-700">
                      <div className="font-medium text-gray-900">{c.name || '—'}</div>
                      <div className="text-xs text-gray-400">{c.phone}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.brand.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full flex items-center gap-1">
                          <Tag size={9} /> {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c._count.conversations}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDistanceToNow(new Date(c.lastSeenAt), { addSuffix: true })}</td>
                  <td className="px-4 py-3">
                    {c.isBlocked
                      ? <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full flex items-center gap-1 w-fit"><UserX size={10} /> Blocked</span>
                      : <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full w-fit block">Active</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
