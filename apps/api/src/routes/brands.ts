import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@wac/db'

export const brandRouter = Router()

brandRouter.get('/', async (req, res) => {
  const brands = await prisma.brand.findMany({
    include: { _count: { select: { conversations: true } } },
  })
  res.json(brands)
})

brandRouter.get('/:id', async (req, res) => {
  const brand = await prisma.brand.findUnique({
    where: { id: req.params.id },
    include: { escalationRules: true, messageTemplates: true },
  })
  if (!brand) return res.status(404).json({ error: 'Brand not found' })
  res.json(brand)
})

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  systemPrompt: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  language: z.string().default('en'),
})

brandRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const brand = await prisma.brand.create({ data: parsed.data })
  res.status(201).json(brand)
})

brandRouter.patch('/:id', async (req, res) => {
  const { name, systemPrompt, keywords, isActive, language } = req.body
  const data: any = {}
  if (name !== undefined) data.name = name
  if (systemPrompt !== undefined) data.systemPrompt = systemPrompt
  if (keywords !== undefined) data.keywords = keywords
  if (isActive !== undefined) data.isActive = isActive
  if (language !== undefined) data.language = language

  const brand = await prisma.brand.update({
    where: { id: req.params.id },
    data,
  })
  res.json(brand)
})
