import { Router } from 'express'
import { prisma } from '@wac/db'

export const analyticsRouter = Router()

analyticsRouter.get('/', async (req, res) => {
  const { brandId } = req.query
  const brandFilter = brandId ? { brandId: brandId as string } : {}

  const now = new Date()
  const day7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const day30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalConversations,
    openConversations,
    resolvedConversations,
    totalMessages,
    totalContacts,
    newContactsThisWeek,
    conversationsThisWeek,
    recentMessages,
  ] = await Promise.all([
    prisma.conversation.count({ where: brandFilter }),
    prisma.conversation.count({ where: { ...brandFilter, status: 'OPEN' } }),
    prisma.conversation.count({ where: { ...brandFilter, status: 'RESOLVED' } }),
    prisma.message.count({
      where: brandId
        ? { conversation: { brandId: brandId as string } }
        : {},
    }),
    prisma.contact.count({ where: brandId ? { brandId: brandId as string } : {} }),
    prisma.contact.count({
      where: {
        ...(brandId ? { brandId: brandId as string } : {}),
        firstSeenAt: { gte: day7ago },
      },
    }),
    prisma.conversation.count({
      where: { ...brandFilter, openedAt: { gte: day7ago } },
    }),
    // Last 30 days of messages for the daily chart
    prisma.message.findMany({
      where: {
        ...(brandId ? { conversation: { brandId: brandId as string } } : {}),
        sentAt: { gte: day30ago },
      },
      select: { sentAt: true, direction: true },
      orderBy: { sentAt: 'asc' },
    }),
  ])

  // Build daily message counts for chart
  const dailyMap: Record<string, { date: string; inbound: number; outbound: number }> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { date: key, inbound: 0, outbound: 0 }
  }
  for (const m of recentMessages) {
    const key = m.sentAt.toISOString().slice(0, 10)
    if (dailyMap[key]) {
      if (m.direction === 'INBOUND') dailyMap[key].inbound++
      else dailyMap[key].outbound++
    }
  }

  // Per-brand breakdown
  const brandBreakdown = await prisma.conversation.groupBy({
    by: ['brandId'],
    _count: { id: true },
    where: { openedAt: { gte: day30ago } },
  })
  const brandNames = await prisma.brand.findMany({ select: { id: true, name: true } })
  const brandMap = Object.fromEntries(brandNames.map((b) => [b.id, b.name]))

  res.json({
    totals: {
      conversations: totalConversations,
      openConversations,
      resolvedConversations,
      messages: totalMessages,
      contacts: totalContacts,
      newContactsThisWeek,
      conversationsThisWeek,
    },
    dailyMessages: Object.values(dailyMap),
    brandBreakdown: brandBreakdown.map((b) => ({
      brand: brandMap[b.brandId] || b.brandId,
      conversations: b._count.id,
    })),
  })
})
