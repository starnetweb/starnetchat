import { Router } from 'express'
import { prisma } from '@wac/db'
import { getSocket } from '@wac/whatsapp'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

export const chatRouter = Router()

const uploadDir = path.join(__dirname, '../../uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`),
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }) // 20MB max

chatRouter.get('/conversations', async (req, res) => {
  const { brandId, status, page = '1', limit = '20' } = req.query
  const skip = (Number(page) - 1) * Number(limit)

  const where: any = {}
  if (brandId) where.brandId = brandId
  if (status) where.status = status

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { updatedAt: 'desc' },
      include: {
        contact: true,
        brand: { select: { name: true, slug: true, logo: true } },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ])

  res.json({ conversations, total, page: Number(page), limit: Number(limit) })
})

chatRouter.get('/conversations/:id/messages', async (req, res) => {
  const { page = '1', limit = '50' } = req.query
  const skip = (Number(page) - 1) * Number(limit)

  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    orderBy: { sentAt: 'asc' },
    skip,
    take: Number(limit),
  })

  res.json(messages)
})

chatRouter.patch('/conversations/:id', async (req, res) => {
  const { status, assignedTo, notes } = req.body
  const conversation = await prisma.conversation.update({
    where: { id: req.params.id },
    data: { status, assignedTo, notes },
  })
  res.json(conversation)
})

// Send a message from the dashboard (human reply)
chatRouter.post('/conversations/:id/send', async (req, res) => {
  const { message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'message required' })

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { contact: true },
  })
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })

  const sock = getSocket()
  if (!sock) return res.status(503).json({ error: 'WhatsApp not connected' })

  const jid = conversation.contact.whatsappJid
  await sock.sendMessage(jid, { text: message.trim() })

  const saved = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      role: 'ASSISTANT',
      content: message.trim(),
    },
  })

  res.json(saved)
})

// Send media attachment from dashboard
chatRouter.post('/conversations/:id/send-media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: { contact: true },
  })
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })

  const sock = getSocket()
  if (!sock) return res.status(503).json({ error: 'WhatsApp not connected' })

  const jid = conversation.contact.whatsappJid
  const caption = (req.body.caption || '').trim()
  const mime = req.file.mimetype
  const buffer = fs.readFileSync(req.file.path)
  const fileName = req.file.originalname
  const mediaUrl = `/uploads/${req.file.filename}`

  try {
    if (mime.startsWith('image/')) {
      await sock.sendMessage(jid, { image: buffer, caption })
    } else if (mime.startsWith('video/')) {
      await sock.sendMessage(jid, { video: buffer, caption })
    } else if (mime.startsWith('audio/')) {
      await sock.sendMessage(jid, { audio: buffer, mimetype: mime as any })
    } else {
      await sock.sendMessage(jid, { document: buffer, mimetype: mime, fileName, caption })
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to send via WhatsApp: ' + err.message })
  }

  const saved = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      role: 'ASSISTANT',
      content: caption || fileName,
      mediaUrl,
      mediaType: mime,
    },
  })

  res.json(saved)
})

// Mark all messages in a conversation as read
chatRouter.post('/conversations/:id/read', async (req, res) => {
  await prisma.message.updateMany({
    where: { conversationId: req.params.id, direction: 'INBOUND', isRead: false },
    data: { isRead: true },
  })
  res.json({ success: true })
})

// Unread counts per conversation
chatRouter.get('/unread', async (req, res) => {
  const counts = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { direction: 'INBOUND', isRead: false },
    _count: { id: true },
  })
  const map: Record<string, number> = {}
  for (const c of counts) map[c.conversationId] = c._count.id
  res.json(map)
})
