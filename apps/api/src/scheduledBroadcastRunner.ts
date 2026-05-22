import { prisma } from '@wac/db'
import { getSocket } from '@wac/whatsapp'

export function startScheduledBroadcastRunner() {
  // Check every 60 seconds for due scheduled broadcasts
  setInterval(async () => {
    try {
      const due = await prisma.scheduledBroadcast.findMany({
        where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
      })

      for (const broadcast of due) {
        console.log(`[SCHEDULED-BROADCAST] Sending broadcast ${broadcast.id} to ${broadcast.contactIds.length} contacts`)

        // Mark as sent immediately to prevent double-send
        await prisma.scheduledBroadcast.update({
          where: { id: broadcast.id },
          data: { status: 'SENT', sentAt: new Date() },
        })

        const sock = getSocket()
        if (!sock) {
          console.error('[SCHEDULED-BROADCAST] WhatsApp not connected — skipping')
          continue
        }

        const contacts = await prisma.contact.findMany({
          where: { id: { in: broadcast.contactIds }, isBlocked: false },
        })

        for (const contact of contacts) {
          try {
            const jid = contact.whatsappJid || `${contact.phone}@s.whatsapp.net`
            await sock.sendMessage(jid, { text: broadcast.message })

            let conversation = await prisma.conversation.findFirst({
              where: { contactId: contact.id, status: 'OPEN' },
              orderBy: { openedAt: 'desc' },
            })
            if (!conversation) {
              conversation = await prisma.conversation.create({
                data: { brandId: broadcast.brandId, contactId: contact.id, brandConfirmed: true },
              })
            }
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                direction: 'OUTBOUND',
                role: 'ASSISTANT',
                content: broadcast.message,
              },
            })
          } catch (err: any) {
            console.error(`[SCHEDULED-BROADCAST] Failed → ${contact.phone}:`, err.message)
          }
          await new Promise((r) => setTimeout(r, 1500))
        }

        console.log(`[SCHEDULED-BROADCAST] Done: ${broadcast.id}`)
      }
    } catch (err: any) {
      console.error('[SCHEDULED-BROADCAST] Runner error:', err.message)
    }
  }, 60_000)

  console.log('[SCHEDULED-BROADCAST] Runner started — checking every 60s')
}
