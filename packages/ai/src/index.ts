import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@wac/db'

// Lazily create client so env vars are loaded by the time it's called
function getClient() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in environment')
  return new Anthropic({ apiKey: key })
}

export async function detectBrand(
  userMessage: string,
  conversationHistory: string[]
): Promise<{ brandId: string; confidence: 'high' | 'low' } | null> {
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    select: { id: true, name: true, keywords: true },
  })

  if (brands.length === 0) return null

  const brandList = brands
    .map((b) => `- ID: ${b.id} | Name: ${b.name} | Keywords: ${b.keywords.join(', ')}`)
    .join('\n')

  const context = conversationHistory.slice(-4).join('\n')

  const response = await getClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    system: `You are a brand router. Given a customer message, identify which brand they are contacting.
Return ONLY a JSON object like: {"brandId": "<id>", "confidence": "high"} or {"brandId": null, "confidence": "low"} if unclear.
Do not explain. Only output valid JSON.

Available brands:
${brandList}`,
    messages: [
      {
        role: 'user',
        content: `Recent conversation:\n${context}\n\nLatest message: "${userMessage}"`,
      },
    ],
  })

  try {
    let text = (response.content[0] as Anthropic.TextBlock).text.trim()
    // Strip markdown code blocks if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    console.log('[AI] detectBrand raw response:', text)
    const parsed = JSON.parse(text)
    if (!parsed.brandId) return null
    return { brandId: parsed.brandId, confidence: parsed.confidence }
  } catch (err: any) {
    console.error('[AI] detectBrand parse error:', err.message)
    return null
  }
}

export async function generateAIResponse(
  brandId: string,
  conversationId: string,
  userMessage: string
): Promise<string> {
  const [brand, conversation] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.conversation.findUnique({ where: { id: conversationId } }),
  ])
  if (!brand) throw new Error('Brand not found')

  // Fetch recent conversation history (last 20 messages)
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { sentAt: 'asc' },
    take: 20,
  })

  // Retrieve relevant knowledge base chunks (RAG)
  const knowledgeContext = await retrieveRelevantChunks(brandId, userMessage)

  // Fetch label instructions for any labels on this conversation
  const labels: string[] = (conversation as any)?.labels || []
  let labelContext = ''
  if (labels.length > 0) {
    const labelInstructions = await prisma.labelInstruction.findMany({
      where: { brandId, label: { in: labels } },
    })
    if (labelInstructions.length > 0) {
      labelContext = '\n\nLABEL CONTEXT (follow these instructions based on the chat label):\n' +
        labelInstructions.map(l => `- [${l.label}]: ${l.instruction}`).join('\n')
    }
  }

  const systemPrompt = `${brand.systemPrompt}

${knowledgeContext ? `KNOWLEDGE BASE:\n${knowledgeContext}` : ''}${labelContext}

Always respond in ${brand.language === 'en' ? 'English' : brand.language}.
Keep responses concise and helpful. If you cannot answer, politely say so and offer to escalate.`

  const messages: Anthropic.MessageParam[] = history.slice(0, -1).map((m) => ({
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.content,
  }))

  messages.push({ role: 'user', content: userMessage })

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  return (response.content[0] as Anthropic.TextBlock).text
}

async function retrieveRelevantChunks(brandId: string, query: string): Promise<string> {
  // Simple keyword search fallback — replace with pgvector cosine similarity for production
  // Use Prisma ORM instead of raw SQL to avoid column name issues
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { brandId },
    select: { content: true },
    take: 3,
  })
  return chunks.map((c) => c.content).join('\n\n')
}

export async function embedAndStoreChunks(
  brandId: string,
  fileName: string,
  rawText: string
): Promise<number> {
  // Split into ~500-char chunks with overlap
  const chunkSize = 500
  const overlap = 50
  const chunks: string[] = []

  for (let i = 0; i < rawText.length; i += chunkSize - overlap) {
    chunks.push(rawText.slice(i, i + chunkSize))
  }

  // Delete existing chunks for this file
  await prisma.knowledgeChunk.deleteMany({ where: { brandId, sourceFile: fileName } })

  // Store chunks (embeddings via pgvector can be added here later)
  await prisma.knowledgeChunk.createMany({
    data: chunks.map((content, idx) => ({
      brandId,
      sourceFile: fileName,
      chunkIndex: idx,
      content,
    })),
  })

  return chunks.length
}

export async function deleteKnowledgeBase(brandId: string) {
  await prisma.knowledgeChunk.deleteMany({ where: { brandId } })
}
