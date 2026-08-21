'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/store'
import { User, Lock, Bell, Shield, Save, Loader2, Bot, GraduationCap } from 'lucide-react'
import { api } from '@/lib/api'

export default function SettingsPage() {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiModel, setAiModel] = useState<'claude' | 'gpt'>('claude')
  const [modelSaving, setModelSaving] = useState(false)
  const [modelSaved, setModelSaved] = useState(false)
  const [learnMode, setLearnMode] = useState(false)
  const [learnSaving, setLearnSaving] = useState(false)

  useEffect(() => {
    api.get('/whatsapp/ai-model').then((d: any) => setAiModel(d.aiModel ?? 'claude')).catch(() => {})
    api.get('/whatsapp/learn-mode').then((d: any) => setLearnMode(d.learnMode ?? false)).catch(() => {})
  }, [])

  async function handleLearnModeToggle(value: boolean) {
    setLearnSaving(true)
    try {
      await api.post('/whatsapp/learn-mode', { learnMode: value })
      setLearnMode(value)
    } finally {
      setLearnSaving(false)
    }
  }

  async function handleModelSwitch(model: 'claude' | 'gpt') {
    setModelSaving(true)
    try {
      await api.post('/whatsapp/ai-model', { aiModel: model })
      setAiModel(model)
      setModelSaved(true)
      setTimeout(() => setModelSaved(false), 3000)
    } finally {
      setModelSaving(false)
    }
  }

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    emailNotifications: true,
    escalationAlerts: true,
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
            <User size={16} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Profile</h2>
            <p className="text-xs text-gray-400">Your account information</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
            <input
              className="input bg-gray-50"
              value={form.email}
              disabled
            />
          </div>
          <div className="md:col-span-2">
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
              <Shield size={11} /> {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Password */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <Lock size={16} className="text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Change Password</h2>
            <p className="text-xs text-gray-400">Leave blank to keep current password</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.currentPassword}
              onChange={e => setForm({ ...form, currentPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.newPassword}
              onChange={e => setForm({ ...form, newPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
            <Bell size={16} className="text-yellow-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Notifications</h2>
            <p className="text-xs text-gray-400">Choose what alerts you receive</p>
          </div>
        </div>
        <div className="space-y-4">
          {[
            { key: 'emailNotifications', label: 'Email notifications', desc: 'Receive email updates for new conversations' },
            { key: 'escalationAlerts', label: 'Escalation alerts', desc: 'Get notified when a conversation is escalated' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <div className="text-sm font-medium text-gray-800">{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, [key]: !(f as any)[key] }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  (form as any)[key] ? 'bg-green-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  (form as any)[key] ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* AI Model */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <Bot size={16} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">AI Model</h2>
            <p className="text-xs text-gray-400">Choose which AI model responds to customers</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              id: 'claude' as const,
              name: 'Claude Haiku',
              provider: 'Anthropic',
              desc: 'Fast, efficient, great at following rules',
              color: 'orange',
            },
            {
              id: 'gpt' as const,
              name: 'GPT-5.4 Nano',
              provider: 'OpenAI',
              desc: 'Cheapest GPT-5 class model, fast responses',
              color: 'green',
            },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => handleModelSwitch(m.id)}
              disabled={modelSaving}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                aiModel === m.id
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              {aiModel === m.id && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-500" />
              )}
              <div className="text-sm font-semibold text-gray-900">{m.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">{m.provider}</div>
              <div className="text-xs text-gray-500 mt-1.5">{m.desc}</div>
            </button>
          ))}
        </div>
        {modelSaved && (
          <p className="text-xs text-green-600 font-medium mt-3">✓ Model updated successfully</p>
        )}
      </div>

      {/* Learn Mode */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <GraduationCap size={16} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">AI Learning Mode</h2>
            <p className="text-xs text-gray-400">Let the AI observe and learn from your human agents before going live</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 mb-4">
          <div className="flex-1">
            <div className={`text-sm font-semibold ${learnMode ? 'text-indigo-700' : 'text-gray-700'}`}>
              {learnMode ? 'Learn Mode — AI is observing' : 'Active Mode — AI is responding'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {learnMode
                ? 'AI stays silent. Your human replies are captured as training examples.'
                : 'AI replies using everything it has learned so far.'}
            </div>
          </div>
          <button
            onClick={() => handleLearnModeToggle(!learnMode)}
            disabled={learnSaving}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ml-4 ${
              learnMode ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              learnMode ? 'translate-x-8' : 'translate-x-1'
            }`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`p-3 rounded-xl border text-sm ${!learnMode ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
            <div className="font-medium text-gray-800 mb-1">Active</div>
            <div className="text-xs text-gray-500">AI responds to all messages using its training and knowledge base.</div>
          </div>
          <div className={`p-3 rounded-xl border text-sm ${learnMode ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-gray-50'}`}>
            <div className="font-medium text-gray-800 mb-1">Learn</div>
            <div className="text-xs text-gray-500">Human agents reply. The AI watches and stores each Q&amp;A as an example.</div>
          </div>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Tip: Start in Learn mode, let your team handle chats for a few days, then switch to Active — the AI will reply in your team's tone.
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Saving...</>
            : <><Save size={15} /> Save Changes</>
          }
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
      </div>
    </div>
  )
}
