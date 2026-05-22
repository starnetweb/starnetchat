import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import P from 'pino'
import path from 'path'
import fs from 'fs'
import { prisma, SessionStatus } from '@wac/db'
import { handleIncomingMessage, handleHumanAgentReply, setEventBus } from './messageHandler'
import { EventEmitter } from 'events'

const SESSION_ID = 'main'
let activeSocket: ReturnType<typeof makeWASocket> | null = null
let _eventBus: EventEmitter | null = null
let reconnectCount = 0

export function initEventBus(bus: EventEmitter) {
  _eventBus = bus
  setEventBus(bus)
}

export async function initWhatsappSessions() {
  console.log('WhatsApp: session manager initialized')
}

export async function connect() {
  if (activeSocket) {
    console.log('[WA] Already connected, skipping')
    return
  }

  const sessionDir = path.join(process.env.WA_SESSION_PATH || './wa-sessions', SESSION_ID)
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

  console.log(`[WA] Connecting... (attempt #${++reconnectCount})`)

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()
    console.log(`[WA] Using Baileys version: ${version.join('.')}`)

    const logger = P({ level: 'silent' })

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: true, // also print in terminal for debugging
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      getMessage: async () => undefined,
    })

    activeSocket = sock

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      try {
        if (qr) {
          console.log('[WA] QR code generated — scan with WhatsApp Business')
          await upsertSession({ status: SessionStatus.QR_READY, qrCode: qr })
          _eventBus?.emit('socket:emit', { event: 'qr', data: { qr } })
        }

        if (connection === 'connecting') {
          console.log('[WA] Connecting to WhatsApp...')
        }

        if (connection === 'open') {
          reconnectCount = 0
          console.log('[WA] ✓ Connected successfully!')
          await upsertSession({ status: SessionStatus.CONNECTED, qrCode: null })
          _eventBus?.emit('socket:emit', { event: 'wa:connected', data: {} })
        }

        if (connection === 'close') {
          const err = lastDisconnect?.error as Boom | undefined
          const statusCode = err?.output?.statusCode
          const reason = err?.message || 'unknown'

          console.log(`[WA] Disconnected — statusCode: ${statusCode}, reason: ${reason}`)

          activeSocket = null
          await upsertSession({ status: SessionStatus.DISCONNECTED })
          _eventBus?.emit('socket:emit', { event: 'wa:disconnected', data: {} })

          if (statusCode === DisconnectReason.loggedOut) {
            console.log('[WA] Logged out — clearing session. Re-scan QR to reconnect.')
            try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
            // Don't auto-reconnect — user must scan QR again
          } else if (statusCode === DisconnectReason.badSession) {
            console.log('[WA] Bad session — clearing and reconnecting...')
            try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
            setTimeout(connect, 3000)
          } else {
            // Any other disconnect: reconnect with backoff
            const delay = Math.min(5000 * reconnectCount, 30000)
            console.log(`[WA] Reconnecting in ${delay / 1000}s...`)
            setTimeout(connect, delay)
          }
        }
      } catch (err: any) {
        console.error('[WA] connection.update handler error:', err)
      }
    })

    // Capture WhatsApp Business label events
    sock.ev.on('labels.association', async ({ association, type }: any) => {
      try {
        const { handleLabelChange } = await import('./messageHandler')
        await handleLabelChange(association, type)
      } catch (err: any) {
        console.error('[WA] Label association error:', err.message)
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`[WA] messages.upsert fired — type: ${type}, count: ${messages.length}`)
      if (type !== 'notify') return
      for (const msg of messages) {
        console.log(`[WA] Message from: ${msg.key.remoteJid}, fromMe: ${msg.key.fromMe}`)
        if (!msg.key.fromMe) {
          // Incoming message from customer — process with AI
          try {
            await handleIncomingMessage(sock, msg)
          } catch (err: any) {
            console.error('[WA] Error handling message:', err)
          }
        } else {
          // Outgoing message sent by human CS agent from WhatsApp — capture for learning
          try {
            await handleHumanAgentReply(msg)
          } catch (err: any) {
            console.error('[WA] Error capturing human reply:', err)
          }
        }
      }
    })

  } catch (err: any) {
    console.error('[WA] connect() threw an error:', err)
    activeSocket = null
    setTimeout(connect, 10000)
  }
}

async function upsertSession(data: { status: SessionStatus; qrCode?: string | null }) {
  try {
    await prisma.whatsappSession.upsert({
      where: { sessionKey: SESSION_ID },
      create: { sessionKey: SESSION_ID, ...data },
      update: data,
    })
  } catch (err: any) {
    console.error('[WA] upsertSession error:', err.message)
  }
}

export async function disconnect() {
  if (activeSocket) {
    try { await activeSocket.logout() } catch {}
    activeSocket = null
  }
  await upsertSession({ status: SessionStatus.DISCONNECTED })
}

export async function getSessionStatus() {
  const session = await prisma.whatsappSession.findUnique({ where: { sessionKey: SESSION_ID } })
  return { status: session?.status || 'DISCONNECTED', connected: !!activeSocket }
}

export async function getQRCode() {
  const session = await prisma.whatsappSession.findUnique({ where: { sessionKey: SESSION_ID } })
  return session?.qrCode || null
}

export function getSocket() {
  return activeSocket
}

export const connectBrand = connect
export const disconnectBrand = disconnect
