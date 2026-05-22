import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@wac/db'

export const automationRouter = Router()

// Templates
automationRouter.get('/templates', async (req, res) => {
  const { brandId } = req.query
  const templates = await prisma.messageTemplate.findMany({
    where: brandId ? { brandId: String(brandId) } : undefined,
  })
  res.json(templates)
})

automationRouter.post('/templates', async (req, res) => {
  const schema = z.object({
    brandId: z.string(),
    name: z.string(),
    body: z.string(),
    variables: z.array(z.string()).default([]),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const template = await prisma.messageTemplate.create({ data: parsed.data })
  res.status(201).json(template)
})

// Rules
automationRouter.get('/rules', async (req, res) => {
  const { brandId } = req.query
  const rules = await prisma.automationRule.findMany({
    where: brandId ? { brandId: String(brandId) } : undefined,
    include: { template: true },
  })
  res.json(rules)
})

automationRouter.post('/rules', async (req, res) => {
  const schema = z.object({
    brandId: z.string(),
    name: z.string(),
    triggerEvent: z.enum([
      'CONVERSATION_OPENED',
      'NO_REPLY_FROM_CUSTOMER',
      'NO_REPLY_FROM_AGENT',
      'CONVERSATION_RESOLVED',
      'CUSTOM_KEYWORD',
    ]),
    delayMinutes: z.number().min(0),
    templateId: z.string(),
    conditions: z.record(z.any()).default({}),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const rule = await prisma.automationRule.create({ data: parsed.data })
  res.status(201).json(rule)
})

automationRouter.patch('/rules/:id', async (req, res) => {
  const rule = await prisma.automationRule.update({
    where: { id: req.params.id },
    data: req.body,
  })
  res.json(rule)
})

automationRouter.delete('/rules/:id', async (req, res) => {
  await prisma.automationRule.delete({ where: { id: req.params.id } })
  res.json({ message: 'Deleted' })
})
