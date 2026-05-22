import { proto } from '@whiskeysockets/baileys'
import { prisma } from '@wac/db'
import { generateAIResponse, detectBrand } from '@wac/ai'
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
      data: { brandId, contactId: contact.id, brandConfirmed: true },
      include: { messages: { take: 0 } },
    })
  } else if (!conversation.brandConfirmed) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { brandId, brandConfirmed: true },
    })
  }

  // Store inbound message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      role: 'USER',
      content: text,
      whatsappMsgId: msg.key.id,
    },
  })

  emit('message:new', { conversationId: conversation.id, direction: 'INBOUND', content: text })

  // ── Quick Reply Check (fires even in human mode — not AI) ────────────────
  const quickReplies = await prisma.quickReply.findMany({
    where: { brandId, isActive: true },
    include: { messages: { orderBy: { order: 'asc' } } },
  })

  const textLower = text.toLowerCase()
  const matched = quickReplies.find((qr) => {
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
  const response = await generateAIResponse(brandId!, conversation.id, text)
  console.log(`[AI] Response: "${response.slice(0, 80)}..."`)

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

  if (isNew) {
    await scheduleAutomations(brandId!, conversation.id, 'CONVERSATION_OPENED')
  }
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
