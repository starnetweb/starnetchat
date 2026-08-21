import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { prisma } from '@wac/db'

// ── Clients ───────────────────────────────────────────────────────────────────

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in environment')
  return new Anthropic({ apiKey: key })
}

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set in environment')
  return new OpenAI({ apiKey: key })
}

async function getAIModel(): Promise<string> {
  const session = await prisma.whatsappSession.findFirst({ where: { sessionKey: 'main' } })
  return session?.aiModel ?? 'claude'
}

// ── Brand Detection (always uses Claude Haiku — cheap + fast) ────────────────

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

  const response = await getAnthropicClient().messages.create({
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

// ── Generate AI Response ──────────────────────────────────────────────────────

export async function generateAIResponse(
  brandId: string,
  conversationId: string,
  userMessage: string
): Promise<string> {
  const [brand, conversation, aiModel] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.conversation.findUnique({ where: { id: conversationId } }),
    getAIModel(),
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

  // Fetch top learned patterns for this brand (human-agent examples)
  const learnedPatterns = await prisma.learnedPattern.findMany({
    where: { brandId },
    orderBy: { frequency: 'desc' },
    take: 10,
    select: { userMessage: true, agentReply: true },
  })

  const learnedContext = learnedPatterns.length > 0
    ? '\n\nLEARNED EXAMPLES (real replies from your human support team — match this tone and style):\n' +
      learnedPatterns
        .map((p, i) => `Example ${i + 1}:\nCustomer: ${p.userMessage}\nAgent: ${p.agentReply}`)
        .join('\n\n')
    : ''

  const systemPrompt = `${brand.systemPrompt}

${knowledgeContext ? `KNOWLEDGE BASE:\n${knowledgeContext}` : ''}${labelContext}${learnedContext}

Always respond in ${brand.language === 'en' ? 'English' : brand.language}.
Keep responses concise and helpful. If you cannot answer, politely say so and offer to escalate.
IMPORTANT: Never use emojis in any response. Plain text only.`

  console.log(`[AI] Using model: ${aiModel}`)

  if (aiModel === 'gpt') {
    return generateWithOpenAI(systemPrompt, history, userMessage)
  }
  return generateWithClaude(systemPrompt, history, userMessage)
}

async function generateWithClaude(
  systemPrompt: string,
  history: any[],
  userMessage: string
): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.slice(0, -1).map((m) => ({
    role: m.role === 'USER' ? 'user' : 'assistant',
    content: m.content,
  }))
  messages.push({ role: 'user', content: userMessage })

  const response = await getAnthropicClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  return (response.content[0] as Anthropic.TextBlock).text
}

async function generateWithOpenAI(
  systemPrompt: string,
  history: any[],
  userMessage: string
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(0, -1).map((m) => ({
      role: (m.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const response = await getOpenAIClient().chat.completions.create({
    model: 'gpt-5.4-nano',
    max_tokens: 1024,
    messages,
  })

  return response.choices[0].message.content ?? ''
}

// ── RAG ───────────────────────────────────────────────────────────────────────

async function retrieveRelevantChunks(brandId: string, query: string): Promise<string> {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { brandId },
    select: { content: true },
    take: 3,
  })
  return chunks.map((c) => c.content).join('\n\n')
}

// ── Knowledge Base Management ─────────────────────────────────────────────────

export async function embedAndStoreChunks(
  brandId: string,
  fileName: string,
  rawText: string
): Promise<number> {
  const chunkSize = 500
  const overlap = 50
  const chunks: string[] = []

  for (let i = 0; i < rawText.length; i += chunkSize - overlap) {
    chunks.push(rawText.slice(i, i + chunkSize))
  }

  await prisma.knowledgeChunk.deleteMany({ where: { brandId, sourceFile: fileName } })

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
