import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  user: { id: string; email: string; name: string; role: string } | null
  setAuth: (token: string, user: AuthState['user']) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        localStorage.setItem('wac_token', token)
        set({ token, user })
      },
      clear: () => {
        localStorage.removeItem('wac_token')
        set({ token: null, user: null })
      },
    }),
    { name: 'wac_auth' }
  )
)
