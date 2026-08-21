import { prisma } from '@wac/db'
import { getSocket } from '@wac/whatsapp'

export function startReEngagementRunner() {
  // Run every 6 hours
  setInterval(runReEngagement, 6 * 60 * 60 * 1000)
  // Also run once on startup after a short delay
  setTimeout(runReEngagement, 60 * 1000)
}

async function runReEngagement() {
  console.log('[RE-ENGAGE] Checking for cold conversations...')
  const sock = getSocket()
  if (!sock) return

  const brands = await prisma.brand.findMany({ where: { isActive: true }, select: { id: true, name: true, reEngageDays: true, messageTemplates: true } })

  for (const brand of brands) {
    if (!brand.reEngageDays) continue
    const cutoff = new Date(Date.now() - brand.reEngageDays * 24 * 60 * 60 * 1000)

    const staleConvs = await prisma.conversation.findMany({
      where: {
        brandId: brand.id,
        status: 'OPEN',
        lastCustomerMsgAt: { lte: cutoff },
        // Don't re-engage if we already sent CSAT (means it was resolved)
        csatSent: false,
      },
      include: { contact: true },
      take: 20,
    })

    for (const conv of staleConvs) {
      const jid = conv.contact.whatsappJid
      const msg = `Hi${conv.contact.name ? ` ${conv.contact.name}` : ''}! Just checking in — is there anything else we can help you with regarding ${brand.name}?`

      try {
        await sock.sendMessage(jid, { text: msg })
        await prisma.message.create({
          data: { conversationId: conv.id, direction: 'OUTBOUND', role: 'ASSISTANT', content: msg },
        })
        // Update lastCustomerMsgAt so we don't spam
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { lastCustomerMsgAt: new Date() } as any,
        })
        console.log(`[RE-ENGAGE] Sent follow-up to ${conv.contact.phone} for brand ${brand.name}`)
      } catch (err: any) {
        console.error(`[RE-ENGAGE] Failed for ${conv.contact.phone}:`, err.message)
      }
    }
  }
}
