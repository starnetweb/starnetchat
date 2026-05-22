import dotenv from 'dotenv'
import path from 'path'
// Load .env from apps/api/ directory (one level up from src/)
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// ── Global crash protection ───────────────────────────────────────────────────
// Prevents Baileys / BullMQ errors from killing the entire API process
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] Caught — keeping server alive:', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] Caught — keeping server alive:', reason)
})

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { brandRouter } from './routes/brands'
import { chatRouter } from './routes/chats'
import { automationRouter } from './routes/automation'
import { waRouter } from './routes/whatsapp'
import { trainingRouter } from './routes/training'
import { labelRouter } from './routes/labels'
import { quickReplyRouter } from './routes/quickReplies'
import { broadcastRouter } from './routes/broadcast'
import { contactRouter } from './routes/contacts'
import { cannedResponseRouter } from './routes/cannedResponses'
import { analyticsRouter } from './routes/analytics'
import { authRouter } from './routes/auth'
import { authMiddleware } from './middleware/auth'
import { eventBus } from './events'

const app = express()
const httpServer = createServer(app)

export const io = new SocketServer(httpServer, {
  cors: { origin: process.env.DASHBOARD_URL || 'http://localhost:3000' },
})

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: process.env.DASHBOARD_URL || 'http://localhost:3000' }))
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Public routes
app.use('/api/auth', authRouter)

// Protected routes
app.use('/api/brands', authMiddleware, brandRouter)
app.use('/api/chats', authMiddleware, chatRouter)
app.use('/api/automation', authMiddleware, automationRouter)
app.use('/api/whatsapp', authMiddleware, waRouter)
app.use('/api/training', authMiddleware, trainingRouter)
app.use('/api/labels', authMiddleware, labelRouter)
app.use('/api/quick-replies', authMiddleware, quickReplyRouter)
app.use('/api/broadcast', authMiddleware, broadcastRouter)
app.use('/api/contacts', authMiddleware, contactRouter)
app.use('/api/canned-responses', authMiddleware, cannedResponseRouter)
app.use('/api/analytics', authMiddleware, analyticsRouter)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

// Forward events from whatsapp/queue packages to Socket.io
eventBus.on('socket:emit', ({ room, event, data }: any) => {
  if (room) {
    io.to(room).emit(event, data)
  } else {
    io.emit(event, data)
  }
})

const PORT = process.env.API_PORT || 4000

async function start() {
  // Dynamically import to avoid circular dependency issues
  const { initQueue } = await import('@wac/queue')
  const { initWhatsappSessions } = await import('@wac/whatsapp')

  const { startScheduledBroadcastRunner } = await import('./scheduledBroadcastRunner')

  httpServer.listen(PORT, async () => {
    console.log(`API running on port ${PORT}`)
    await initQueue()
    await initWhatsappSessions()
    startScheduledBroadcastRunner()

    // Auto-connect WhatsApp on startup
    const { connect, initEventBus } = await import('@wac/whatsapp')
    initEventBus(eventBus)
    console.log('WhatsApp: auto-connecting...')
    connect().catch((err: any) => console.error('WhatsApp auto-connect error:', err.message))
  })
}

start().catch(console.error)
