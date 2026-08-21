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

  const msgLower = userMessage.toLowerCase()

  // ── Step 1: Direct name/keyword match in the current message only ──────────
  // A brand is only assigned when the customer explicitly mentions it.
  for (const brand of brands) {
    const terms = [brand.name, ...brand.keywords].map((t) => t.toLowerCase())
    if (terms.some((t) => msgLower.includes(t))) {
      console.log(`[BRAND] Direct match: "${brand.name}" in message`)
      return { brandId: brand.id, confidence: 'high' }
    }
  }

  // ── Step 2: Check recent conversation history for an explicit mention ──────
  // Only look back if no match in current message — and only accept high confidence
  const recentHistory = conversationHistory.slice(-6).join(' ').toLowerCase()
  for (const brand of brands) {
    const terms = [brand.name, ...brand.keywords].map((t) => t.toLowerCase())
    if (terms.some((t) => recentHistory.includes(t))) {
      console.log(`[BRAND] History match: "${brand.name}"`)
      return { brandId: brand.id, confidence: 'high' }
    }
  }

  // ── No explicit mention — do NOT guess ────────────────────────────────────
  console.log('[BRAND] No brand name mentioned — returning null')
  return null
}

// ── Sentiment Analysis ────────────────────────────────────────────────────────

export async function analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative' | 'angry'> {
  try {
    const response = await getAnthropicClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 20,
      system: 'Classify the sentiment of the customer message. Reply with exactly one word: positive, neutral, negative, or angry. No explanation.',
      messages: [{ role: 'user', content: text }],
    })
    const raw = (response.content[0] as Anthropic.TextBlock).text.trim().toLowerCase()
    if (['positive', 'neutral', 'negative', 'angry'].includes(raw)) return raw as any
    return 'neutral'
  } catch { return 'neutral' }
}

// ── AI Auto-Labeling ──────────────────────────────────────────────────────────

const ALL_AI_LABELS = [
  'AI-interested',    // customer showing buying interest
  'AI-price-inquiry', // asked about pricing/cost
  'AI-complaint',     // expressing frustration or complaint
  'AI-followup',      // needs a follow-up from the team
  'AI-resolved',      // question/issue fully answered
  'AI-unresolved',    // AI couldn't fully answer
  'AI-urgent',        // time-sensitive or escalation needed
  'AI-new-lead',      // first contact, potential new customer
  'AI-paid',          // customer confirmed payment / has paid
  'AI-completed',     // project/service/order has been delivered or completed
]

export async function autoLabelConversation(messages: { role: string; content: string }[]): Promise<string[]> {
  try {
    const transcript = messages.slice(-10).map((m) => `${m.role === 'USER' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n')
    const response = await getAnthropicClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 80,
      system: `Analyze this customer support conversation and return a JSON array of applicable labels from this list: ${ALL_AI_LABELS.join(', ')}.
Return ONLY a JSON array, e.g. ["AI-interested","AI-price-inquiry"]. Empty array if none apply. No explanation.`,
      messages: [{ role: 'user', content: transcript }],
    })
    const raw = (response.content[0] as Anthropic.TextBlock).text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((l: string) => ALL_AI_LABELS.includes(l)) : []
  } catch { return [] }
}

// ── Conversation Summary ──────────────────────────────────────────────────────

export async function summarizeConversation(messages: { role: string; content: string }[]): Promise<string> {
  const transcript = messages.map((m) => `${m.role === 'USER' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n')
  const response = await getAnthropicClient().messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: 'Summarize this customer support conversation in 3-5 bullet points. Focus on: what the customer needed, what was resolved, and any follow-up required. Plain text, no emojis.',
    messages: [{ role: 'user', content: transcript }],
  })
  return (response.content[0] as Anthropic.TextBlock).text.trim()
}

// ── Generate AI Response ──────────────────────────────────────────────────────

export async function generateAIResponse(
  brandId: string,
  conversationId: string,
  userMessage: string
): Promise<{ text: string; lowConfidence: boolean }> {
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

Detect the language the customer is writing in and reply in that same language (e.g. if they write in Yoruba, reply in Yoruba; Pidgin, reply in Pidgin). Override this only if the brand language is explicitly required.
Keep responses concise and helpful. If you genuinely cannot answer, reply with exactly: [HANDOFF] followed by your message to the customer.
IMPORTANT: Never use emojis in any response. Plain text only.`

  console.log(`[AI] Using model: ${aiModel}`)

  let rawText: string
  if (aiModel === 'gpt') {
    rawText = await generateWithOpenAI(systemPrompt, history, userMessage)
  } else {
    rawText = await generateWithClaude(systemPrompt, history, userMessage)
  }

  const lowConfidence = rawText.startsWith('[HANDOFF]')
  const text = lowConfidence ? rawText.replace('[HANDOFF]', '').trim() : rawText
  return { text, lowConfidence }
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
