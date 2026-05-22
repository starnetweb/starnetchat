import { Router } from 'express'
import { prisma } from '@wac/db'

export const cannedResponseRouter = Router()

cannedResponseRouter.get('/:brandId', async (req, res) => {
  const items = await prisma.cannedResponse.findMany({
    where: { brandId: req.params.brandId },
    orderBy: { title: 'asc' },
  })
  res.json(items)
})

cannedResponseRouter.post('/:brandId', async (req, res) => {
  const { title, body } = req.body
  if (!title || !body) return res.status(400).json({ error: 'title and body required' })
  const item = await prisma.cannedResponse.create({
    data: { brandId: req.params.brandId, title, body },
  })
  res.json(item)
})

cannedResponseRouter.put('/:brandId/:id', async (req, res) => {
  const { title, body } = req.body
  const item = await prisma.cannedResponse.update({
    where: { id: req.params.id },
    data: { title, body },
  })
  res.json(item)
})

cannedResponseRouter.delete('/:brandId/:id', async (req, res) => {
  await prisma.cannedResponse.delete({ where: { id: req.params.id } })
  res.json({ success: true })
})
