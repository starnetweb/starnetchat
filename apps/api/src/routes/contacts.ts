import { Router } from 'express'
import { prisma } from '@wac/db'

export const contactRouter = Router()

// List contacts (optionally filter by brand)
contactRouter.get('/', async (req, res) => {
  const { brandId } = req.query
  const contacts = await prisma.contact.findMany({
    where: brandId ? { brandId: brandId as string } : undefined,
    orderBy: { lastSeenAt: 'desc' },
    include: {
      brand: { select: { name: true, slug: true } },
      _count: { select: { conversations: true } },
    },
  })
  res.json(contacts)
})

// Get single contact with full conversation history
contactRouter.get('/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      brand: { select: { name: true, slug: true } },
      conversations: {
        orderBy: { openedAt: 'desc' },
        include: {
          brand: { select: { name: true, slug: true } },
          messages: { orderBy: { sentAt: 'asc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      },
    },
  })
  if (!contact) return res.status(404).json({ error: 'Contact not found' })
  res.json(contact)
})

// Update contact (notes, tags, name)
contactRouter.patch('/:id', async (req, res) => {
  const { notes, tags, name } = req.body
  const updated = await prisma.contact.update({
    where: { id: req.params.id },
    data: {
      ...(notes !== undefined && { notes }),
      ...(tags !== undefined && { tags }),
      ...(name !== undefined && { name }),
    },
  })
  res.json(updated)
})

// Block / unblock
contactRouter.post('/:id/block', async (req, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } })
  if (!contact) return res.status(404).json({ error: 'Not found' })
  const updated = await prisma.contact.update({
    where: { id: req.params.id },
    data: { isBlocked: !contact.isBlocked },
  })
  res.json({ isBlocked: updated.isBlocked })
})

// Export contacts as CSV
contactRouter.get('/export/:brandId', async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { brandId: req.params.brandId },
    orderBy: { lastSeenAt: 'desc' },
  })

  const rows = [
    ['Name', 'Phone', 'Tags', 'Blocked', 'First Seen', 'Last Seen', 'Notes'],
    ...contacts.map((c) => [
      c.name || '',
      c.phone,
      c.tags.join('; '),
      c.isBlocked ? 'Yes' : 'No',
      c.firstSeenAt.toISOString(),
      c.lastSeenAt.toISOString(),
      (c.notes || '').replace(/\n/g, ' '),
    ]),
  ]

  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="contacts-${req.params.brandId}.csv"`)
  res.send(csv)
})
