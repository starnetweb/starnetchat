'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Upload, Trash2, Tag, Plus, Save, X } from 'lucide-react'

interface Brand { id: string; name: string }
interface Chunk { id: string; sourceFile: string; chunkIndex: number; content: string }
interface LabelInstruction { id: string; label: string; instruction: string }

type Tab = 'knowledge' | 'labels'

export default function TrainingPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [tab, setTab] = useState<Tab>('knowledge')

  // Knowledge base state
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [uploading, setUploading] = useState(false)

  // Label instructions state
  const [labelInstructions, setLabelInstructions] = useState<LabelInstruction[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newInstruction, setNewInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editInstruction, setEditInstruction] = useState('')

  useEffect(() => {
    api.get('/brands').then(setBrands)
  }, [])

  useEffect(() => {
    if (!selectedBrand) return
    if (tab === 'knowledge') {
      api.get(`/training/${selectedBrand}/chunks`).then(setChunks)
    } else {
      api.get(`/labels/${selectedBrand}`).then(setLabelInstructions)
    }
  }, [selectedBrand, tab])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedBrand) return
    setUploading(true)
    const text = await file.text()
    await api.post(`/training/${selectedBrand}/upload`, { content: text, fileName: file.name })
    const updated = await api.get(`/training/${selectedBrand}/chunks`)
    setChunks(updated)
    setUploading(false)
  }

  async function clearKnowledge() {
    if (!selectedBrand || !confirm('Clear all knowledge for this brand?')) return
    await api.delete(`/training/${selectedBrand}/chunks`)
    setChunks([])
  }

  async function addLabelInstruction() {
    if (!newLabel.trim() || !newInstruction.trim() || !selectedBrand) return
    setSaving(true)
    await api.put(`/labels/${selectedBrand}`, { label: newLabel.trim(), instruction: newInstruction.trim() })
    const updated = await api.get(`/labels/${selectedBrand}`)
    setLabelInstructions(updated)
    setNewLabel('')
    setNewInstruction('')
    setSaving(false)
  }

  async function saveEdit(label: string) {
    if (!editInstruction.trim() || !selectedBrand) return
    setSaving(true)
    await api.put(`/labels/${selectedBrand}`, { label, instruction: editInstruction.trim() })
    const updated = await api.get(`/labels/${selectedBrand}`)
    setLabelInstructions(updated)
    setEditingId(null)
    setSaving(false)
  }

  async function deleteLabel(label: string) {
    if (!confirm(`Delete label instruction for "${label}"?`)) return
    await api.delete(`/labels/${selectedBrand}/${encodeURIComponent(label)}`)
    setLabelInstructions((prev) => prev.filter((l) => l.label !== label))
  }

  const files = [...new Set(chunks.map((c) => c.sourceFile))]

  // Common label suggestions
  const suggestions = ['Follow Up', 'Project Delivered', 'Pending Payment', 'VIP Customer', 'New Customer', 'Dispute', 'Resolved']

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Brand Training</h1>
        <p className="text-sm text-gray-500 mt-0.5">Train the AI with knowledge and label-specific behavior</p>
      </div>

      {/* Brand selector */}
      <div className="card p-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">Select Brand</label>
        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="input w-64"
        >
          <option value="">Choose a brand...</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {selectedBrand && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setTab('knowledge')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'knowledge' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              📄 Knowledge Base
            </button>
            <button
              onClick={() => setTab('labels')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'labels' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              🏷️ Label Instructions
            </button>
          </div>

          {/* Knowledge Base Tab */}
          {tab === 'knowledge' && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Upload Knowledge</h2>
                  <p className="text-sm text-gray-500">Upload .txt or .md files with FAQs, policies, product info</p>
                </div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm cursor-pointer">
                    <Upload size={15} />
                    {uploading ? 'Uploading...' : 'Upload File'}
                    <input type="file" accept=".txt,.md" onChange={handleFileUpload} className="hidden" />
                  </label>
                  {chunks.length > 0 && (
                    <button onClick={clearKnowledge} className="flex items-center gap-2 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 text-sm">
                      <Trash2 size={15} /> Clear All
                    </button>
                  )}
                </div>
              </div>
              {files.length > 0 ? (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div key={file} className="flex items-center justify-between text-sm px-3 py-2 bg-gray-50 rounded-lg">
                      <span className="font-medium">{file}</span>
                      <span className="text-gray-400">{chunks.filter((c) => c.sourceFile === file).length} chunks</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No files uploaded yet</p>
              )}
            </div>
          )}

          {/* Label Instructions Tab */}
          {tab === 'labels' && (
            <div className="space-y-4">
              {/* How it works */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <div className="font-semibold mb-1">How label instructions work</div>
                When you apply a WhatsApp Business label to a chat (e.g. "Follow Up"), the AI automatically reads the instruction you set here and adjusts its response accordingly.
              </div>

              {/* Add new label instruction */}
              <div className="card p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Tag size={16} /> Add Label Instruction</h2>

                {/* Quick suggestions */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewLabel(s)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition ${newLabel === s ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:border-green-400'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Label Name</label>
                    <input
                      className="input"
                      placeholder='e.g. "Follow Up" — must match exactly what you use in WhatsApp'
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AI Instruction</label>
                    <textarea
                      className="input min-h-[100px] resize-none"
                      placeholder='e.g. "This customer is waiting for a follow-up on their project. Apologize for any delay, provide a status update, and give a realistic timeline. Be empathetic and professional."'
                      value={newInstruction}
                      onChange={(e) => setNewInstruction(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={addLabelInstruction}
                    disabled={saving || !newLabel.trim() || !newInstruction.trim()}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={15} /> {saving ? 'Saving...' : 'Add Instruction'}
                  </button>
                </div>
              </div>

              {/* Existing label instructions */}
              {labelInstructions.length > 0 && (
                <div className="card p-6">
                  <h2 className="font-semibold text-gray-900 mb-4">Saved Label Instructions</h2>
                  <div className="space-y-3">
                    {labelInstructions.map((li) => (
                      <div key={li.id} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                            🏷️ {li.label}
                          </span>
                          <div className="flex gap-2">
                            {editingId === li.id ? (
                              <>
                                <button onClick={() => saveEdit(li.label)} className="text-xs text-green-600 font-medium flex items-center gap-1"><Save size={12} /> Save</button>
                                <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 flex items-center gap-1"><X size={12} /> Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditingId(li.id); setEditInstruction(li.instruction) }} className="text-xs text-blue-600 font-medium">Edit</button>
                                <button onClick={() => deleteLabel(li.label)} className="text-xs text-red-500 font-medium">Delete</button>
                              </>
                            )}
                          </div>
                        </div>
                        {editingId === li.id ? (
                          <textarea
                            className="input min-h-[80px] resize-none text-sm"
                            value={editInstruction}
                            onChange={(e) => setEditInstruction(e.target.value)}
                          />
                        ) : (
                          <p className="text-sm text-gray-600">{li.instruction}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {labelInstructions.length === 0 && (
                <div className="card p-10 text-center text-gray-400 text-sm">
                  No label instructions yet. Add one above.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
