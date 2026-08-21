import { prisma } from '@wac/db'
import { getSocket } from '@wac/whatsapp'

const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000
// Only consider conversations opened within the last 30 days — ignore ancient history
const MAX_CONV_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Human labels that indicate a project/order was completed
const COMPLETED_HUMAN_LABELS = ['completed', 'delivered', 'done', 'project delivered', 'order delivered', 'finished']

export function startSmartFollowUpRunner() {
  // Run every hour — NO startup fire to avoid blasting on redeploy
  setInterval(runSmartFollowUps, 60 * 60 * 1000)
}

async function runSmartFollowUps() {
  console.log('[SMART-FOLLOWUP] Running smart follow-up checks...')
  const sock = getSocket()
  if (!sock) return

  await Promise.all([
    runCompletedReviewRequests(sock),
    runNoReplyFollowUps(sock),
  ])
}

// ── Completed: ask for a review + offer free PowerPoint ──────────────────────
async function runCompletedReviewRequests(sock: any) {
  const cutoff = new Date(Date.now() - TWENTY_THREE_HOURS)
  const oldestAllowed = new Date(Date.now() - MAX_CONV_AGE_MS)

  // Only conversations opened in the last 30 days, at least 23h old, not yet sent
  const candidates = await prisma.conversation.findMany({
    where: {
      status: 'OPEN',
      reviewRequestSent: false,
      openedAt: { lte: cutoff, gte: oldestAllowed },
    } as any,
    include: {
      contact: true,
      brand: { select: { name: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1 },
    },
  })

  for (const conv of candidates) {
    const aiLabels: string[] = (conv as any).aiLabels || []
    const humanLabels: string[] = (conv as any).labels || []

    const isCompletedByAI = aiLabels.includes('AI-completed')
    const isCompletedByHuman = humanLabels.some((l) =>
      COMPLETED_HUMAN_LABELS.some((cl) => l.toLowerCase().includes(cl))
    )

    // Must be explicitly marked completed — never fire speculatively
    if (!isCompletedByAI && !isCompletedByHuman) continue

    const jid = conv.contact.whatsappJid
    const name = conv.contact.name ? ` ${conv.contact.name}` : ''
    const brandName = conv.brand.name

    const reviewMsg =
      `Hi${name}! We hope you are satisfied with your ${brandName} project.\n\n` +
      `We would love to hear your experience — could you leave us a quick review? It means a lot to our team.\n\n` +
      `As a thank you, we will send you a FREE professionally designed PowerPoint presentation for your project. Just drop your review and we will get it across to you right away!`

    try {
      await sock.sendMessage(jid, { text: reviewMsg })
      await prisma.message.create({
        data: { conversationId: conv.id, direction: 'OUTBOUND', role: 'ASSISTANT', content: reviewMsg },
      })
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { reviewRequestSent: true } as any,
      })
      console.log(`[SMART-FOLLOWUP] Review request sent to ${conv.contact.phone} (${brandName})`)
    } catch (err: any) {
      console.error(`[SMART-FOLLOWUP] Review request failed for ${conv.contact.phone}:`, err.message)
    }
  }
}

// ── No-reply: customer went silent after being asked a question ───────────────
async function runNoReplyFollowUps(sock: any) {
  const cutoff = new Date(Date.now() - TWENTY_THREE_HOURS)
  const oldestAllowed = new Date(Date.now() - MAX_CONV_AGE_MS)

  // Only conversations where:
  // - lastCustomerMsgAt is set (customer actually messaged before — not null/never)
  // - That last customer message was 23h+ ago
  // - Conversation opened within last 30 days
  const candidates = await prisma.conversation.findMany({
    where: {
      status: 'OPEN',
      noReplyFollowUpSent: false,
      openedAt: { gte: oldestAllowed },
      lastCustomerMsgAt: { not: null, lte: cutoff },
    } as any,
    include: {
      contact: true,
      brand: { select: { name: true } },
      messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { direction: true, content: true } },
    },
  })

  for (const conv of candidates) {
    // Only follow up if the LAST message was from us (OUTBOUND) — we asked and they didn't reply
    const lastMsg = conv.messages[0]
    if (!lastMsg || lastMsg.direction !== 'OUTBOUND') continue

    // Skip if our last message was already a follow-up / re-engagement (avoid loop)
    const lastContent = lastMsg.content.toLowerCase()
    if (
      lastContent.includes('just checking in') ||
      lastContent.includes('still interested') ||
      lastContent.includes("haven't heard back") ||
      lastContent.includes('review') ||
      lastContent.includes("we noticed we haven't heard")
    ) continue

    const jid = conv.contact.whatsappJid
    const name = conv.contact.name ? ` ${conv.contact.name}` : ''
    const brandName = conv.brand.name

    const followUpMsg =
      `Hi${name}! We noticed we haven't heard back from you regarding ${brandName}.\n\n` +
      `We are still here and happy to help — feel free to continue whenever you are ready.`

    try {
      await sock.sendMessage(jid, { text: followUpMsg })
      await prisma.message.create({
        data: { conversationId: conv.id, direction: 'OUTBOUND', role: 'ASSISTANT', content: followUpMsg },
      })
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { noReplyFollowUpSent: true } as any,
      })
      console.log(`[SMART-FOLLOWUP] No-reply follow-up sent to ${conv.contact.phone} (${brandName})`)
    } catch (err: any) {
      console.error(`[SMART-FOLLOWUP] No-reply follow-up failed for ${conv.contact.phone}:`, err.message)
    }
  }
}
