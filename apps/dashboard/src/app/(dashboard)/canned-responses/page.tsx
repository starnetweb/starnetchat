'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Trash2, Edit2, Save, X, MessageSquare } from 'lucide-react'

interface Brand { id: string; name: string }
interface CannedResponse { id: string; title: string; body: string }

export default function CannedResponsesPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [items, setItems] = useState<CannedResponse[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { api.get('/brands').then(setBrands) }, [])
  useEffect(() => {
    if (!selectedBrand) return
    api.get(`/canned-responses/${selectedBrand}`).then(setItems)
  }, [selectedBrand])

  function startEdit(item: CannedResponse) {
    setEditingId(item.id); setTitle(item.title); setBody(item.body); setShowForm(true)
  }

  function cancel() {
    setShowForm(false); setEditingId(null); setTitle(''); setBody('')
  }

  async function save() {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    if (editingId) {
      await api.put(`/canned-responses/${selectedBrand}/${editingId}`, { title, body })
    } else {
      await api.post(`/canned-responses/${selectedBrand}`, { title, body })
    }
    const updated = await api.get(`/canned-responses/${selectedBrand}`)
    setItems(updated); cancel(); setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Delete this canned response?')) return
    await api.delete(`/canned-responses/${selectedBrand}/${id}`)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={20} /> Canned Responses</h1>
        <p className="text-sm text-gray-500 mt-0.5">Reusable reply snippets for human CS agents — paste them instantly while chatting</p>
      </div>

      <div className="card p-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">Select Brand</label>
        <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="input w-64">
          <option value="">Choose a brand...</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {selectedBrand && (
        <>
          {showForm ? (
            <div className="card p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">{editingId ? 'Edit' : 'New'} Canned Response</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-gray-400 font-normal">(internal label)</span></label>
                <input className="input" placeholder='e.g. "Greeting", "Payment link", "Hours"' value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
                <textarea className="input min-h-[120px] resize-none" placeholder="Type the full reply here..." value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                  <Save size={14} /> {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
                </button>
                <button onClick={cancel} className="btn-secondary flex items-center gap-2"><X size={14} /> Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={15} /> New Canned Response
            </button>
          )}

          {items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 mb-1">{item.title}</div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{item.body}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEdit(item)} className="text-blue-500 hover:text-blue-700"><Edit2 size={15} /></button>
                      <button onClick={() => remove(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : !showForm && (
            <div className="card p-10 text-center text-gray-400 text-sm">No canned responses yet. Create one above.</div>
          )}
        </>
      )}
    </div>
  )
}
