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

// AI model selection
waRouter.get('/ai-model', async (_req, res) => {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  res.json({ aiModel: session?.aiModel ?? 'claude' })
})

waRouter.post('/ai-model', async (req, res) => {
  const { aiModel } = req.body
  if (!['claude', 'gpt'].includes(aiModel)) {
    return res.status(400).json({ error: 'Invalid model. Use "claude" or "gpt"' })
  }
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const updated = await prisma.whatsappSession.update({
    where: { id: session.id },
    data: { aiModel },
  })
  res.json({ aiModel: updated.aiModel })
})

// Learn mode — when on, AI is silent and human replies are captured as training examples
waRouter.get('/learn-mode', async (_req, res) => {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  res.json({ learnMode: session?.learnMode ?? false })
})

waRouter.post('/learn-mode', async (req, res) => {
  const { learnMode } = req.body
  if (typeof learnMode !== 'boolean') {
    return res.status(400).json({ error: 'learnMode must be a boolean' })
  }
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const updated = await prisma.whatsappSession.update({
    where: { id: session.id },
    data: { learnMode },
  })
  res.json({ learnMode: updated.learnMode })
})

// List learned patterns per brand
waRouter.get('/learned-patterns/:brandId', async (req, res) => {
  const patterns = await prisma.learnedPattern.findMany({
    where: { brandId: req.params.brandId },
    orderBy: { frequency: 'desc' },
    take: 50,
  })
  res.json(patterns)
})

// Delete a learned pattern
waRouter.delete('/learned-patterns/:id', async (req, res) => {
  await prisma.learnedPattern.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})
