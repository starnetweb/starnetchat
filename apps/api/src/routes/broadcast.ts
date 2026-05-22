import { Router } from 'express'
import { prisma } from '@wac/db'
import { getSocket } from '@wac/whatsapp'

export const broadcastRouter = Router()

// ── Scheduled broadcasts ──────────────────────────────────────────────────────

broadcastRouter.get('/scheduled/:brandId', async (req, res) => {
  const items = await prisma.scheduledBroadcast.findMany({
    where: { brandId: req.params.brandId },
    orderBy: { scheduledAt: 'asc' },
  })
  res.json(items)
})

broadcastRouter.post('/schedule', async (req, res) => {
  const { brandId, contactIds, message, scheduledAt } = req.body
  if (!brandId || !contactIds?.length || !message || !scheduledAt) {
    return res.status(400).json({ error: 'brandId, contactIds, message, scheduledAt required' })
  }
  const item = await prisma.scheduledBroadcast.create({
    data: { brandId, contactIds, message, scheduledAt: new Date(scheduledAt) },
  })
  res.json(item)
})

broadcastRouter.delete('/scheduled/:id', async (req, res) => {
  await prisma.scheduledBroadcast.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
  })
  res.json({ success: true })
})

// List contacts for a brand (for the UI picker)
broadcastRouter.get('/contacts/:brandId', async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { brandId: req.params.brandId, isBlocked: false },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, name: true, phone: true, whatsappJid: true, lastSeenAt: true },
  })
  res.json(contacts)
})

// Send broadcast to selected contacts
broadcastRouter.post('/send', async (req, res) => {
  const { brandId, contactIds, message, delayMs = 1500 } = req.body

  if (!brandId || !contactIds?.length || !message?.trim()) {
    return res.status(400).json({ error: 'brandId, contactIds, and message are required' })
  }

  const sock = getSocket()
  if (!sock) return res.status(503).json({ error: 'WhatsApp not connected' })

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, brandId, isBlocked: false },
  })

  // Respond immediately — send in background with delays
  res.json({ queued: contacts.length, message: `Sending to ${contacts.length} contacts...` })

  // Fire-and-forget with per-message delay to avoid WhatsApp spam detection
  ;(async () => {
    let sent = 0
    let failed = 0

    for (const contact of contacts) {
      try {
        const jid = contact.whatsappJid || `${contact.phone}@s.whatsapp.net`
        await sock.sendMessage(jid, { text: message.trim() })

        // Log as outbound message in DB (find or create conversation)
        let conversation = await prisma.conversation.findFirst({
          where: { contactId: contact.id, status: 'OPEN' },
          orderBy: { openedAt: 'desc' },
        })
        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: { brandId, contactId: contact.id, brandConfirmed: true },
          })
        }
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'OUTBOUND',
            role: 'ASSISTANT',
            content: message.trim(),
          },
        })

        sent++
        console.log(`[BROADCAST] Sent ${sent}/${contacts.length} → ${contact.phone}`)
      } catch (err: any) {
        failed++
        console.error(`[BROADCAST] Failed → ${contact.phone}:`, err.message)
      }

      // Delay between messages to avoid bans
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    }

    console.log(`[BROADCAST] Done. Sent: ${sent}, Failed: ${failed}`)
  })()
})
