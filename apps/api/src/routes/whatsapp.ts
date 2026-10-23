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

// AI Schedule — get/set schedule config
waRouter.get('/ai-schedule', async (_req, res) => {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  res.json({ aiSchedule: session?.aiSchedule ?? null })
})

waRouter.post('/ai-schedule', async (req, res) => {
  const { aiSchedule } = req.body
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  if (!session) return res.status(404).json({ error: 'Session not found' })
  const updated = await prisma.whatsappSession.update({
    where: { id: session.id },
    data: { aiSchedule },
  })
  res.json({ aiSchedule: updated.aiSchedule })
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
    'we noticed we haven',
  ]

  const conversations = await prisma.conversation.findMany({
    where: { brandConfirmed: true },
    select: {
      id: true,
      brandId: true,
      messages: {
        orderBy: { sentAt: 'asc' },
        select: { direction: true, content: true },
      },
    },
  })

  // Collect all pairs first, deduplicate in memory
  const pairMap = new Map<string, { brandId: string; userMessage: string; agentReply: string; frequency: number }>()

  for (const conv of conversations) {
    const msgs = conv.messages
    for (let i = 0; i < msgs.length - 1; i++) {
      const current = msgs[i]
      const next = msgs[i + 1]
      if (current.direction !== 'INBOUND' || next.direction !== 'OUTBOUND') continue

      const q = current.content.trim()
      const a = next.content.trim()
      if (q.length < 8 || a.length < 8) continue
      if (SKIP_PHRASES.some((p) => a.toLowerCase().includes(p))) continue

      const key = `${conv.brandId}::${q}::${a}`
      const existing = pairMap.get(key)
      if (existing) {
        existing.frequency++
      } else {
        pairMap.set(key, { brandId: conv.brandId, userMessage: q, agentReply: a, frequency: 1 })
      }
    }
  }

  const pairs = Array.from(pairMap.values())
  let added = 0
  let updated = 0

  // Upsert in batches of 20 to avoid overwhelming the DB
  for (let i = 0; i < pairs.length; i += 20) {
    const batch = pairs.slice(i, i + 20)
    await Promise.all(batch.map(async (p) => {
      const existing = await prisma.learnedPattern.findFirst({
        where: { brandId: p.brandId, userMessage: p.userMessage, agentReply: p.agentReply },
        select: { id: true },
      })
      if (existing) {
        await prisma.learnedPattern.update({ where: { id: existing.id }, data: { frequency: { increment: p.frequency } } })
        updated++
      } else {
        await prisma.learnedPattern.create({ data: p })
        added++
      }
    }))
  }

  res.json({ added, updated, total: added + updated, conversations: conversations.length })
})

// ── AI Suggested Replies (Learn Mode review queue) ────────────────────────────

// List suggestions — paginated, filterable by status
waRouter.get('/suggested-replies', async (req, res) => {
  const status = (req.query.status as string) || 'pending'
  const page = parseInt(req.query.page as string) || 1
  const take = 20
  const skip = (page - 1) * take

  const [items, total] = await Promise.all([
    prisma.suggestedReply.findMany({
      where: status === 'all' ? {} : { status },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        brand: { select: { name: true, slug: true } },
        conversation: { select: { id: true } },
      },
    }),
    prisma.suggestedReply.count({ where: status === 'all' ? {} : { status } }),
  ])

  res.json({ items, total, page, pages: Math.ceil(total / take) })
})

// Get counts per status for the badge
waRouter.get('/suggested-replies/counts', async (_req, res) => {
  const [pending, approved, rejected] = await Promise.all([
    prisma.suggestedReply.count({ where: { status: 'pending' } }),
    prisma.suggestedReply.count({ where: { status: 'approved' } }),
    prisma.suggestedReply.count({ where: { status: 'rejected' } }),
  ])
  res.json({ pending, approved, rejected, total: pending + approved + rejected })
})

// Approve a suggestion (with optional human correction) — adds to LearnedPatterns
waRouter.post('/suggested-replies/:id/approve', async (req, res) => {
  const { humanCorrection } = req.body
  const suggestion = await prisma.suggestedReply.findUnique({ where: { id: req.params.id } })
  if (!suggestion) return res.status(404).json({ error: 'Not found' })

  const finalReply = humanCorrection?.trim() || suggestion.aiSuggestion

  // Upsert into LearnedPatterns
  const existing = await prisma.learnedPattern.findFirst({
    where: { brandId: suggestion.brandId, userMessage: suggestion.userMessage, agentReply: finalReply },
  })
  if (existing) {
    await prisma.learnedPattern.update({ where: { id: existing.id }, data: { frequency: { increment: 1 } } })
  } else {
    await prisma.learnedPattern.create({
      data: { brandId: suggestion.brandId, userMessage: suggestion.userMessage, agentReply: finalReply },
    })
  }

  const updated = await prisma.suggestedReply.update({
    where: { id: req.params.id },
    data: { status: 'approved', humanCorrection: humanCorrection?.trim() || null },
  })

  res.json(updated)
})

// Reject a suggestion
waRouter.post('/suggested-replies/:id/reject', async (req, res) => {
  const updated = await prisma.suggestedReply.update({
    where: { id: req.params.id },
    data: { status: 'rejected' },
  })
  res.json(updated)
})

// Update the human correction text (before approving)
waRouter.patch('/suggested-replies/:id', async (req, res) => {
  const { humanCorrection } = req.body
  const updated = await prisma.suggestedReply.update({
    where: { id: req.params.id },
    data: { humanCorrection },
  })
  res.json(updated)
})
