'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MessageSquare, Building2, Zap, BookOpen, Settings, LogOut, Menu, X, Reply, Megaphone, Users, BarChart3, Layers } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { useState } from 'react'

const nav = [
  { href: '/chats', label: 'Chats', icon: MessageSquare },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/brands', label: 'Brands & WA', icon: Building2 },
  { href: '/automation', label: 'Automation', icon: Zap },
  { href: '/training', label: 'Training', icon: BookOpen },
  { href: '/quick-replies', label: 'Quick Replies', icon: Reply },
  { href: '/canned-responses', label: 'Canned Replies', icon: Layers },
  { href: '/broadcast', label: 'Broadcast', icon: Megaphone },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, clear } = useAuthStore()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleLogout() {
    clear()
    router.push('/login')
  }

  const Sidebar = () => (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center shadow-sm">
            <MessageSquare size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-gray-900 text-sm">WA Care</div>
            <div className="text-xs text-gray-400">Dashboard</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="px-3 py-2 mb-1">
          <div className="text-xs font-medium text-gray-700 truncate">{user?.name}</div>
          <div className="text-xs text-gray-400 truncate">{user?.email}</div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-lg w-full transition-all font-medium"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="flex flex-col w-64"><Sidebar /></div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600">
            <Menu size={22} />
          </button>
          <div className="font-bold text-gray-900">WA Care</div>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
