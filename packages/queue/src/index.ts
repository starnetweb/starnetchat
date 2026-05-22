import { Queue, Worker, Job } from 'bullmq'
import { prisma, TriggerEvent } from '@wac/db'
import IORedis from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined,
})

export const automationQueue = new Queue('automation', { connection })

export async function initQueue() {
  new Worker('automation', processJob, { connection })
  console.log('Queue: automation worker started')
}

async function processJob(job: Job) {
  const { automationJobId, conversationId, brandId, templateId } = job.data

  const [conversation, template] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, include: { contact: true } }),
    prisma.messageTemplate.findUnique({ where: { id: templateId } }),
  ])

  if (!conversation || conversation.status !== 'OPEN' || !template) {
    await prisma.automationJob.update({
      where: { id: automationJobId },
      data: { status: 'CANCELLED' },
    })
    return
  }

  // Interpolate template variables
  const body = template.body
    .replace('{{name}}', conversation.contact.name || 'there')
    .replace('{{phone}}', conversation.contact.phone)

  // Send via WhatsApp
  const { getSocket } = await import('@wac/whatsapp')
  const sock = getSocket()
  if (sock) {
    const jid = conversation.contact.whatsappJid.includes('@')
      ? conversation.contact.whatsappJid
      : conversation.contact.whatsappJid + '@s.whatsapp.net'
    await sock.sendMessage(jid, { text: body })

    await prisma.message.create({
      data: {
        conversationId,
        direction: 'OUTBOUND',
        role: 'ASSISTANT',
        content: body,
      },
    })
  }

  await prisma.automationJob.update({
    where: { id: automationJobId },
    data: { status: 'EXECUTED', executedAt: new Date() },
  })
}

export async function scheduleAutomations(
  brandId: string,
  conversationId: string,
  triggerEvent: TriggerEvent,
  labelName?: string  // only used for LABEL_APPLIED trigger
) {
  const where: any = { brandId, triggerEvent, isActive: true }

  // For label triggers, only match rules whose conditions include this label
  if (triggerEvent === 'LABEL_APPLIED' && labelName) {
    where.conditions = { path: ['label'], equals: labelName }
  }

  const rules = await prisma.automationRule.findMany({ where })

  for (const rule of rules) {
    const delayMs = rule.delayMinutes * 60 * 1000
    const scheduledAt = new Date(Date.now() + delayMs)

    const automationJob = await prisma.automationJob.create({
      data: { ruleId: rule.id, conversationId, scheduledAt, status: 'PENDING' },
    })

    const bullJob = await automationQueue.add(
      'send-message',
      { automationJobId: automationJob.id, conversationId, brandId, templateId: rule.templateId },
      { delay: delayMs }
    )

    await prisma.automationJob.update({
      where: { id: automationJob.id },
      data: { bullJobId: bullJob.id },
    })
  }
}

export async function cancelConversationJobs(conversationId: string) {
  const pendingJobs = await prisma.automationJob.findMany({
    where: { conversationId, status: 'PENDING' },
  })

  for (const job of pendingJobs) {
    if (job.bullJobId) {
      const bullJob = await automationQueue.getJob(job.bullJobId)
      await bullJob?.remove()
    }
    await prisma.automationJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED' },
    })
  }
}
