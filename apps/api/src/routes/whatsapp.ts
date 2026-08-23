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

// Train from history — scan all past conversations and extract Q&A pairs as LearnedPatterns
waRouter.post('/train-from-history', async (_req, res) => {
  const SKIP_PHRASES = [
    "hi! we noticed we haven't heard back",
    'just checking in',
    'how would you rate our support',
    'we hope you are satisfied',
    'hello! i can help you with several',
    'could you let me know which brand',
  ]

  const conversations = await prisma.conversation.findMany({
    where: { brandConfirmed: true },
    select: {
      id: true,
      brandId: true,
      messages: {
        orderBy: { sentAt: 'asc' },
        select: { direction: true, content: true, role: true },
      },
    },
  })

  let added = 0
  let updated = 0

  for (const conv of conversations) {
    const msgs = conv.messages
    for (let i = 0; i < msgs.length - 1; i++) {
      const current = msgs[i]
      const next = msgs[i + 1]

      // Only care about INBOUND → OUTBOUND pairs
      if (current.direction !== 'INBOUND' || next.direction !== 'OUTBOUND') continue

      const q = current.content.trim()
      const a = next.content.trim()

      // Skip short or system-like messages
      if (q.length < 8 || a.length < 8) continue
      if (SKIP_PHRASES.some((p) => a.toLowerCase().startsWith(p))) continue

      // Deduplicate — bump frequency if same pair exists
      const existing = await prisma.learnedPattern.findFirst({
        where: { brandId: conv.brandId, userMessage: q, agentReply: a },
      })

      if (existing) {
        await prisma.learnedPattern.update({
          where: { id: existing.id },
          data: { frequency: { increment: 1 } },
        })
        updated++
      } else {
        await prisma.learnedPattern.create({
          data: { brandId: conv.brandId, userMessage: q, agentReply: a, frequency: 1 },
        })
        added++
      }
    }
  }

  res.json({ added, updated, total: added + updated, conversations: conversations.length })
})
