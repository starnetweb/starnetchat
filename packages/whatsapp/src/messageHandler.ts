import { proto } from '@whiskeysockets/baileys'
import { prisma } from '@wac/db'
import { generateAIResponse, detectBrand, analyzeSentiment, autoLabelConversation } from '@wac/ai'
import { scheduleAutomations } from '@wac/queue'
import { EventEmitter } from 'events'

// Injected by the API layer to avoid circular imports
let _eventBus: EventEmitter | null = null
export function setEventBus(bus: EventEmitter) { _eventBus = bus }

function emit(event: string, data: any, room?: string) {
  _eventBus?.emit('socket:emit', { room, event, data })
}

const FALLBACK_PROMPT =
  "Hello! I can help you with several of our services. Could you let me know which brand or service you're reaching out about? (e.g. BlazingProjects, ExamKits, Watmall, Payapp, Realtour, or Stanet Academy)"

export async function handleIncomingMessage(sock: any, msg: proto.IWebMessageInfo) {
  const jid = msg.key.remoteJid!
  // Handle both @s.whatsapp.net and @lid JID formats
  const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '')
  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''

  console.log(`[MSG] From: ${phone} | Text: "${text}" | JID: ${jid}`)

  if (!text) {
    console.log('[MSG] Skipping — no text content')
    return
  }

  // ── Global AI toggle check (checked later — message is always logged) ────
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  const aiEnabled = session?.aiEnabled ?? true
  const learnMode = session?.learnMode ?? false

  // Upsert contact — look up by phone OR jid to handle both formats
  let contact = await prisma.contact.findFirst({
    where: { OR: [{ phone }, { whatsappJid: jid }] },
  })
  if (!contact) {
    const firstBrand = await prisma.brand.findFirst({ where: { isActive: true } })
    if (!firstBrand) return
    try {
      contact = await prisma.contact.create({
        data: { brandId: firstBrand.id, whatsappJid: jid, phone },
      })
    } catch {
      // Race condition — fetch the record that was just created
      contact = await prisma.contact.findFirst({ where: { OR: [{ phone }, { whatsappJid: jid }] } })
      if (!contact) return
    }
  } else {
    await prisma.contact.update({ where: { id: contact.id }, data: { lastSeenAt: new Date(), whatsappJid: jid } })
  }

  // Find open conversation
  let conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
    include: { messages: { orderBy: { sentAt: 'asc' }, take: 10 } },
  })

  const isNew = !conversation

  // ── Brand Detection ──────────────────────────────────────────────────────
  let brandId: string
  let brandConfirmed: boolean

  if (conversation?.brandConfirmed) {
    brandId = conversation.brandId
    brandConfirmed = true
  } else {
    const history = conversation?.messages.map((m) => `${m.role}: ${m.content}`) ?? []
    const detection = await detectBrand(text, history)
    console.log(`[BRAND] Detection result:`, JSON.stringify(detection))

    if (detection && detection.confidence === 'high') {
      brandId = detection.brandId
      brandConfirmed = true
    } else {
      // Only send fallback prompt if AI is enabled — in human mode just log and stop
      if (!aiEnabled) {
        console.log('[MSG] AI disabled — skipping brand detection fallback reply')
        if (!conversation) {
          const anyBrand = await prisma.brand.findFirst({ where: { isActive: true } })
          conversation = await prisma.conversation.create({
            data: { brandId: anyBrand!.id, contactId: contact.id, brandConfirmed: false },
            include: { messages: { take: 0 } },
          })
        }
        await prisma.message.create({
          data: { conversationId: conversation.id, direction: 'INBOUND', role: 'USER', content: text, whatsappMsgId: msg.key.id },
        })
        emit('message:new', { conversationId: conversation.id, direction: 'INBOUND', content: text })
        return
      }
      await sock.sendMessage(jid, { text: FALLBACK_PROMPT })

      if (!conversation) {
        const anyBrand = await prisma.brand.findFirst({ where: { isActive: true } })
        conversation = await prisma.conversation.create({
          data: { brandId: anyBrand!.id, contactId: contact.id, brandConfirmed: false },
          include: { messages: { take: 0 } },
        })
      }

      await prisma.message.createMany({
        data: [
          { conversationId: conversation.id, direction: 'INBOUND', role: 'USER', content: text, whatsappMsgId: msg.key.id },
          { conversationId: conversation.id, direction: 'OUTBOUND', role: 'ASSISTANT', content: FALLBACK_PROMPT },
        ],
      })

      emit('message:new', { conversationId: conversation.id })
      return
    }
  }

  // ── Create / update conversation ─────────────────────────────────────────
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { brandId, contactId: contact.id, brandConfirmed: true, aiManaged: true },
      include: { messages: { take: 0 } },
    })
  } else if (!conversation.brandConfirmed) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { brandId, brandConfirmed: true },
    })
  }

  // Store inbound message + track lastCustomerMsgAt
  await Promise.all([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        role: 'USER',
        content: text,
        whatsappMsgId: msg.key.id,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastCustomerMsgAt: new Date() },
    }),
  ])

  emit('message:new', { conversationId: conversation.id, direction: 'INBOUND', content: text })

  // ── CSAT detection: if we sent a CSAT survey and customer replies with 1-5 ──
  const convFull = await prisma.conversation.findUnique({ where: { id: conversation.id } })
  if (convFull?.csatSent && !convFull.csatScore) {
    const score = parseInt(text.trim())
    if (score >= 1 && score <= 5) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { csatScore: score },
      })
      console.log(`[CSAT] Score ${score} recorded for conversation ${conversation.id}`)
      emit('csat:received', { conversationId: conversation.id, score })
      // Fire webhook
      await fireWebhook(conversation.brandId, 'csat_received', { conversationId: conversation.id, score, contact: phone })
      return // Don't process further — this was a CSAT reply
    }
  }

  // ── Sentiment analysis (background, non-blocking) ────────────────────────
  analyzeSentiment(text).then(async (sentiment) => {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { sentiment } })
    emit('conversation:updated', { conversationId: conversation.id, sentiment })
    // Auto-escalate if angry
    if (sentiment === 'angry') {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'ESCALATED' as any } })
      emit('conversation:escalated', { conversationId: conversation.id, reason: 'Angry sentiment detected' })
      await fireWebhook(conversation.brandId, 'escalation', { conversationId: conversation.id, reason: 'Angry sentiment detected', contact: phone })
      console.log(`[SENTIMENT] Angry detected — conversation ${conversation.id} auto-escalated`)
    }
  }).catch(() => {})

  // ── Skip AI for conversations not started by AI (pre-existing chats) ──────
  if (!(conversation as any).aiManaged) {
    console.log('[MSG] Conversation not AI-managed — skipping AI response')
    return
  }

  // ── Quick Reply Check (fires even in human mode — not AI) ────────────────
  // Determine if this is a first-time or returning contact
  const totalConversations = await prisma.conversation.count({ where: { contactId: contact.id } })
  const isFirstContact = totalConversations <= 1

  const quickReplies = await prisma.quickReply.findMany({
    where: { brandId, isActive: true },
    include: { messages: { orderBy: { order: 'asc' } } },
  })

  const textLower = text.toLowerCase()
  const matched = quickReplies.find((qr) => {
    const ct = (qr as any).contactType ?? 'all'
    if (ct === 'first' && !isFirstContact) return false
    if (ct === 'returning' && isFirstContact) return false

    const kws = qr.keywords.map((k) => k.toLowerCase())
    if (qr.matchType === 'ALL') {
      return kws.every((k) => textLower.includes(k))
    }
    return kws.some((k) => textLower.includes(k))
  })

  if (matched) {
    console.log(`[QUICK-REPLY] Matched rule "${matched.name}" — skipping AI`)
    try { await sock.presenceSubscribe(jid) } catch {}
    for (const qrMsg of matched.messages) {
      if (qrMsg.delaySeconds > 0) {
        await new Promise((r) => setTimeout(r, qrMsg.delaySeconds * 1000))
      }
      await sock.sendPresenceUpdate('composing', jid)
      await new Promise((r) => setTimeout(r, 800)) // brief typing flash
      await sock.sendPresenceUpdate('paused', jid)
      // Pick a random variation if available, otherwise use the default body
      const pool = (qrMsg as any).variations?.length
        ? [(qrMsg as any).body, ...(qrMsg as any).variations]
        : [(qrMsg as any).body]
      const text = pool[Math.floor(Math.random() * pool.length)]
      await sock.sendMessage(jid, { text })
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          role: 'ASSISTANT',
          content: text,
        },
      })
      emit('message:new', { conversationId: conversation.id, direction: 'OUTBOUND', content: text })
    }
    return
  }

  // ── If learn mode is on, AI stays silent — human agent replies will be captured ─
  if (learnMode) {
    console.log('[MSG] Learn mode ON — AI silent, awaiting human reply to learn from')
    return
  }

  // ── If AI is disabled, message is logged and quick replies ran — stop here ─
  if (!aiEnabled) {
    console.log('[MSG] AI globally disabled — message logged, no AI reply')
    return
  }

  // Show typing indicator while AI generates response
  // Must subscribe to presence first — required by Baileys before sendPresenceUpdate works
  try { await sock.presenceSubscribe(jid) } catch {}
  await sock.sendPresenceUpdate('composing', jid)
  emit('typing', { conversationId: conversation.id })

  // Generate AI response
  console.log(`[AI] Generating response for brand ${brandId!}...`)
  const { text: response, lowConfidence } = await generateAIResponse(brandId!, conversation.id, text)
  console.log(`[AI] Response (lowConfidence=${lowConfidence}): "${response.slice(0, 80)}..."`)

  // Stop typing indicator then send
  await sock.sendPresenceUpdate('paused', jid)
  emit('typing:stop', { conversationId: conversation.id })
  await sock.sendMessage(jid, { text: response })

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      role: 'ASSISTANT',
      content: response,
    },
  })

  emit('message:new', { conversationId: conversation.id, direction: 'OUTBOUND', content: response })

  // ── AI confidence handoff: pause AI for this conversation if unsure ───────
  if (lowConfidence) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { aiManaged: false } as any,
    })
    emit('conversation:handoff', { conversationId: conversation.id, reason: 'Low confidence — AI paused, human needed' })
    await fireWebhook(brandId!, 'handoff', { conversationId: conversation.id, contact: phone, lastMessage: text })
    console.log(`[AI] Low confidence — conversation ${conversation.id} handed off to human`)
  }

  // ── Auto-label conversation in background ─────────────────────────────────
  const allMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { sentAt: 'asc' },
    take: 20,
    select: { role: true, content: true },
  })
  autoLabelConversation(allMessages).then(async (labels) => {
    if (labels.length) {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { aiLabels: labels } as any })
      emit('conversation:updated', { conversationId: conversation.id, aiLabels: labels })
    }
  }).catch(() => {})

  if (isNew) {
    await scheduleAutomations(brandId!, conversation.id, 'CONVERSATION_OPENED')
    // Fire new conversation webhook
    await fireWebhook(brandId!, 'new_conversation', { conversationId: conversation.id, contact: phone })
  }
}

// ── Webhook utility ───────────────────────────────────────────────────────────
async function fireWebhook(brandId: string, event: string, payload: any) {
  try {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { webhookUrl: true, slackWebhookUrl: true, name: true } })
    if (!brand) return

    const body = JSON.stringify({ event, brand: brand.name, timestamp: new Date().toISOString(), ...payload })
    const headers = { 'Content-Type': 'application/json' }

    if (brand.webhookUrl) {
      fetch(brand.webhookUrl, { method: 'POST', headers, body }).catch(() => {})
    }
    if (brand.slackWebhookUrl) {
      const slackBody = JSON.stringify({
        text: `*[${brand.name}]* ${event.replace(/_/g, ' ').toUpperCase()}\n${Object.entries(payload).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`,
      })
      fetch(brand.slackWebhookUrl, { method: 'POST', headers, body: slackBody }).catch(() => {})
    }
  } catch { }
}

/**
 * Captures replies typed by a human CS agent directly in WhatsApp.
 * Stores them in the conversation so the AI uses them as context
 * and learns the tone/style of human responses.
 */
export async function handleHumanAgentReply(msg: proto.IWebMessageInfo) {
  const jid = msg.key.remoteJid!
  // Ignore group chats and status messages
  if (jid.includes('@g.us') || jid.includes('broadcast') || jid.includes('status')) return

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''

  if (!text) return

  const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '')
  console.log(`[HUMAN] Looking up contact for jid: ${jid}, phone: ${phone}`)

  // Find the open conversation for this contact
  const contact = await prisma.contact.findFirst({
    where: { OR: [{ phone }, { whatsappJid: jid }] },
  })
  if (!contact) {
    console.log(`[HUMAN] No contact found for ${phone} — skipping`)
    return
  }

  const conversation = await prisma.conversation.findFirst({
    where: { contactId: contact.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  })
  if (!conversation) {
    console.log(`[HUMAN] No open conversation for contact ${contact.id} — skipping`)
    return
  }

  // Avoid duplicate: check if this message was already saved by the AI bot
  const existing = await prisma.message.findFirst({
    where: { whatsappMsgId: msg.key.id! },
  })
  if (existing) return

  // Save as human agent outbound message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      role: 'ASSISTANT',
      content: text,
      whatsappMsgId: msg.key.id,
    },
  })

  console.log(`[HUMAN] CS reply captured for conversation ${conversation.id}: "${text.slice(0, 60)}"`)
  emit('message:new', { conversationId: conversation.id, direction: 'OUTBOUND', content: text })

  // In learn mode: pair this reply with the last customer message as a learned pattern
  const learnSession = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  if (learnSession?.learnMode) {
    const lastInbound = await prisma.message.findFirst({
      where: { conversationId: conversation.id, direction: 'INBOUND' },
      orderBy: { sentAt: 'desc' },
    })
    if (lastInbound) {
      // Deduplicate: if same question was seen before, bump frequency instead of creating a new row
      const existing = await prisma.learnedPattern.findFirst({
        where: {
          brandId: conversation.brandId,
          userMessage: lastInbound.content,
          agentReply: text,
        },
      })
      if (existing) {
        await prisma.learnedPattern.update({
          where: { id: existing.id },
          data: { frequency: existing.frequency + 1 },
        })
      } else {
        await prisma.learnedPattern.create({
          data: {
            brandId: conversation.brandId,
            userMessage: lastInbound.content,
            agentReply: text,
          },
        })
      }
      console.log(`[LEARN] Saved pattern for brand ${conversation.brandId}`)
    }
  }
}

/**
 * Handles WhatsApp Business label changes.
 * Stores labels on the conversation and triggers label-based automations.
 */
export async function handleLabelChange(association: any, type: 'add' | 'remove') {
  try {
    const jid = association.chatId
    if (!jid) return

    const labelName: string = association.labelId || association.name || 'Unknown'
    console.log(`[LABEL] ${type === 'add' ? 'Applied' : 'Removed'} label "${labelName}" to ${jid}`)

    const phone = jid.replace('@s.whatsapp.net', '').replace('@lid', '')
    const contact = await prisma.contact.findFirst({
      where: { OR: [{ phone }, { whatsappJid: jid }] },
    })
    if (!contact) return

    const conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    })
    if (!conversation) return

    // Update labels array on conversation
    const currentLabels: string[] = (conversation as any).labels || []
    let updatedLabels: string[]

    if (type === 'add') {
      updatedLabels = currentLabels.includes(labelName)
        ? currentLabels
        : [...currentLabels, labelName]
    } else {
      updatedLabels = currentLabels.filter((l) => l !== labelName)
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { labels: updatedLabels } as any,
    })

    emit('conversation:updated', { conversationId: conversation.id, labels: updatedLabels })
    console.log(`[LABEL] Conversation ${conversation.id} labels: ${updatedLabels.join(', ')}`)

    // Trigger label-based automations
    if (type === 'add') {
      await scheduleAutomations(conversation.brandId, conversation.id, 'LABEL_APPLIED', labelName)
    }
  } catch (err: any) {
    console.error('[LABEL] handleLabelChange error:', err.message)
  }
}
