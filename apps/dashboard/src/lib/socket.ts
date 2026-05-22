'use client'
import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from './store'

let socket: Socket | null = null

export function useSocket() {
  const [s, setS] = useState<Socket | null>(null)
  const token = useAuthStore((st) => st.token)

  useEffect(() => {
    if (!token) return
    if (!socket) {
      socket = io('http://localhost:4000', {
        auth: { token },
      })
    }
    setS(socket)
    return () => {}
  }, [token])

  return s
}
