'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

interface Rule {
  id: string
  name: string
  triggerEvent: string
  delayMinutes: number
  isActive: boolean
  template: { name: string; body: string }
}

const TRIGGER_LABELS: Record<string, string> = {
  CONVERSATION_OPENED: 'Conversation Opened',
  NO_REPLY_FROM_CUSTOMER: 'No Reply from Customer',
  NO_REPLY_FROM_AGENT: 'No Reply from Agent',
  CONVERSATION_RESOLVED: 'Conversation Resolved',
  CUSTOM_KEYWORD: 'Custom Keyword',
}

export default function AutomationPage() {
  const [rules, setRules] = useState<Rule[]>([])

  useEffect(() => {
    api.get('/automation/rules').then(setRules)
  }, [])

  async function toggleRule(id: string, isActive: boolean) {
    await api.patch(`/automation/rules/${id}`, { isActive: !isActive })
    setRules((r) => r.map((rule) => (rule.id === id ? { ...rule, isActive: !isActive } : rule)))
  }

  async function deleteRule(id: string) {
    await api.delete(`/automation/rules/${id}`)
    setRules((r) => r.filter((rule) => rule.id !== id))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Automation Rules</h1>
        <button className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm">
          <Plus size={16} /> New Rule
        </button>
      </div>

      <div className="space-y-4">
        {rules.map((rule) => (
          <div key={rule.id} className="bg-white border rounded-xl p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-semibold">{rule.name}</div>
              <div className="text-sm text-gray-500">
                Trigger: <span className="font-medium">{TRIGGER_LABELS[rule.triggerEvent]}</span>
                {rule.delayMinutes > 0 && (
                  <> · <span className="font-medium">{rule.delayMinutes} min delay</span></>
                )}
              </div>
              <div className="text-xs text-gray-400">Template: {rule.template.name}</div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => toggleRule(rule.id, rule.isActive)}>
                {rule.isActive
                  ? <ToggleRight size={28} className="text-green-600" />
                  : <ToggleLeft size={28} className="text-gray-300" />}
              </button>
              <button
                onClick={() => deleteRule(rule.id)}
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No automation rules yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  )
}
