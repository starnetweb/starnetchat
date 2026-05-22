import { Router } from 'express'
import { prisma } from '@wac/db'

export const labelRouter = Router()

// Get all label instructions for a brand
labelRouter.get('/:brandId', async (req, res) => {
  const instructions = await prisma.labelInstruction.findMany({
    where: { brandId: req.params.brandId },
    orderBy: { label: 'asc' },
  })
  res.json(instructions)
})

// Create or update a label instruction
labelRouter.put('/:brandId', async (req, res) => {
  const { label, instruction } = req.body
  if (!label || !instruction) return res.status(400).json({ error: 'label and instruction required' })

  const result = await prisma.labelInstruction.upsert({
    where: { brandId_label: { brandId: req.params.brandId, label } },
    create: { brandId: req.params.brandId, label, instruction },
    update: { instruction },
  })
  res.json(result)
})

// Delete a label instruction
labelRouter.delete('/:brandId/:label', async (req, res) => {
  await prisma.labelInstruction.deleteMany({
    where: { brandId: req.params.brandId, label: decodeURIComponent(req.params.label) },
  })
  res.json({ success: true })
})

// Get labels on a specific conversation
labelRouter.get('/conversation/:conversationId', async (req, res) => {
  const conv = await prisma.conversation.findUnique({
    where: { id: req.params.conversationId },
    select: { labels: true },
  })
  res.json({ labels: (conv as any)?.labels || [] })
})

// Manually apply/remove a label on a conversation (for testing)
labelRouter.post('/conversation/:conversationId', async (req, res) => {
  const { label, action } = req.body // action: 'add' | 'remove'
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } })
  if (!conv) return res.status(404).json({ error: 'Conversation not found' })

  const current: string[] = (conv as any).labels || []
  const updated = action === 'add'
    ? current.includes(label) ? current : [...current, label]
    : current.filter((l: string) => l !== label)

  await prisma.conversation.update({
    where: { id: req.params.conversationId },
    data: { labels: updated } as any,
  })
  res.json({ labels: updated })
})
