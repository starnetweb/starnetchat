import { Router } from 'express'
import { getQRCode, connect, disconnect, getSessionStatus } from '@wac/whatsapp'
import { prisma } from '@wac/db'

export const waRouter = Router()

waRouter.get('/status', async (_req, res) => {
  const status = await getSessionStatus()
  res.json(status)
})

waRouter.post('/connect', async (_req, res) => {
  try {
    await connect()
    res.json({ message: 'Connection initiated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

waRouter.post('/disconnect', async (_req, res) => {
  await disconnect()
  res.json({ message: 'Disconnected' })
})

waRouter.get('/qr', async (_req, res) => {
  const qr = await getQRCode()
  if (!qr) return res.status(404).json({ error: 'No QR code available' })
  res.json({ qr })
})

// Global AI toggle
waRouter.get('/ai-status', async (_req, res) => {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  res.json({ aiEnabled: session?.aiEnabled ?? true })
})

waRouter.post('/ai-toggle', async (_req, res) => {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const updated = await prisma.whatsappSession.update({
    where: { id: session.id },
    data: { aiEnabled: !session.aiEnabled },
  })
  res.json({ aiEnabled: updated.aiEnabled })
})
