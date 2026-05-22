import { Router } from 'express'
import { prisma } from '@wac/db'
import { embedAndStoreChunks, deleteKnowledgeBase } from '@wac/ai'

export const trainingRouter = Router()

trainingRouter.get('/:brandId/chunks', async (req, res) => {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { brandId: req.params.brandId },
    select: { id: true, sourceFile: true, chunkIndex: true, content: true, createdAt: true },
  })
  res.json(chunks)
})

trainingRouter.post('/:brandId/upload', async (req, res) => {
  const { content, fileName } = req.body
  if (!content || !fileName) {
    return res.status(400).json({ error: 'content and fileName required' })
  }

  try {
    const count = await embedAndStoreChunks(req.params.brandId, fileName, content)
    res.json({ message: `Stored ${count} chunks from ${fileName}` })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

trainingRouter.delete('/:brandId/chunks', async (req, res) => {
  await deleteKnowledgeBase(req.params.brandId)
  res.json({ message: 'Knowledge base cleared' })
})
