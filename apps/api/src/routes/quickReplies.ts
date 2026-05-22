import { Router } from 'express'
import { prisma } from '@wac/db'

export const quickReplyRouter = Router()

// List all quick replies for a brand
quickReplyRouter.get('/:brandId', async (req, res) => {
  const qrs = await prisma.quickReply.findMany({
    where: { brandId: req.params.brandId },
    include: { messages: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
  res.json(qrs)
})

// Create a quick reply with its messages
quickReplyRouter.post('/:brandId', async (req, res) => {
  const { name, keywords, matchType, messages } = req.body
  if (!name || !keywords?.length || !messages?.length) {
    return res.status(400).json({ error: 'name, keywords, and messages are required' })
  }

  const qr = await prisma.quickReply.create({
    data: {
      brandId: req.params.brandId,
      name,
      keywords,
      matchType: matchType || 'ANY',
      messages: {
        create: messages.map((m: { body: string; variations?: string[]; delaySeconds?: number }, i: number) => ({
          body: m.body,
          variations: m.variations ?? [],
          delaySeconds: m.delaySeconds ?? 0,
          order: i,
        })),
      },
    },
    include: { messages: { orderBy: { order: 'asc' } } },
  })
  res.json(qr)
})

// Update a quick reply
quickReplyRouter.put('/:brandId/:id', async (req, res) => {
  const { name, keywords, matchType, isActive, messages } = req.body

  // Delete old messages and recreate
  await prisma.quickReplyMessage.deleteMany({ where: { quickReplyId: req.params.id } })

  const qr = await prisma.quickReply.update({
    where: { id: req.params.id },
    data: {
      name,
      keywords,
      matchType,
      isActive,
      messages: messages
        ? {
            create: messages.map((m: { body: string; variations?: string[]; delaySeconds?: number }, i: number) => ({
              body: m.body,
              variations: m.variations ?? [],
              delaySeconds: m.delaySeconds ?? 0,
              order: i,
            })),
          }
        : undefined,
    },
    include: { messages: { orderBy: { order: 'asc' } } },
  })
  res.json(qr)
})

// Toggle active state
quickReplyRouter.patch('/:brandId/:id/toggle', async (req, res) => {
  const existing = await prisma.quickReply.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.quickReply.update({
    where: { id: req.params.id },
    data: { isActive: !existing.isActive },
    include: { messages: { orderBy: { order: 'asc' } } },
  })
  res.json(updated)
})

// Delete a quick reply
quickReplyRouter.delete('/:brandId/:id', async (req, res) => {
  await prisma.quickReply.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})
