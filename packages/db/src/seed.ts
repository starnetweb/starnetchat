import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── Admin user ──────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      name: 'Super Admin',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      brandIds: [],
    },
  })
  console.log(`Admin user: ${admin.email} / password: admin123`)

  // ── 6 Brands ─────────────────────────────────────────────────────────────
  const brands = [
    {
      name: 'BlazingProjects',
      slug: 'blazingprojects',
      keywords: [
        'blazingprojects', 'blazing projects', 'blazing', 'project', 'projects',
        'research', 'undergraduate', 'postgraduate', 'thesis', 'dissertation',
        'chapter', 'final year', 'final year project', 'academic', 'research work',
        'complete project', 'project topics', 'blazingprojects.com',
      ],
      systemPrompt: `You are a friendly and knowledgeable customer care agent for BlazingProjects (blazingprojects.com).

BlazingProjects is a platform that provides undergraduate and postgraduate research projects, thesis, dissertations, and academic research materials for Nigerian students.

Your responsibilities:
- Help students find research projects for their field of study and level (HND, BSc, MSc, PhD)
- Explain how to download or access purchased projects
- Assist with payment issues and order confirmations
- Guide students on how to use research materials responsibly
- Answer questions about project topics, chapters, and available departments

Key information:
- Projects cover all departments: Engineering, Sciences, Arts, Social Sciences, Education, Law, Medicine, etc.
- Materials are available for immediate download after payment
- Website: https://blazingprojects.com

Always be warm, encouraging, and academic in tone. If you cannot resolve an issue, offer to escalate to the support team.`,
    },
    {
      name: 'ExamKits',
      slug: 'examkits',
      keywords: [
        'examkits', 'exam kits', 'examkit', 'jamb', 'post utme', 'waec', 'trcn',
        'exam', 'past questions', 'study', 'cbt', 'practice', 'mock exam',
        'utme', 'o level', 'teacher registration', 'neco', 'examination prep',
        'examkits.com', 'questions and answers',
      ],
      systemPrompt: `You are an enthusiastic and helpful customer care agent for ExamKits (examkits.com).

ExamKits is an exam preparatory platform that helps Nigerian students prepare for JAMB (UTME), Post UTME, WAEC, NECO, and TRCN examinations through past questions, mock tests, and study materials.

Your responsibilities:
- Help users access past questions and study materials for their target exam
- Assist with subscription, payment, and account access issues
- Explain how to use the CBT practice platform
- Guide users on which exam packages to purchase
- Provide information on exam dates, registration, and preparation tips

Key information:
- Covers: JAMB/UTME, Post UTME (all universities), WAEC, NECO, TRCN
- Features: CBT practice mode, timed mock exams, performance analytics
- Website: https://examkits.com

Always be motivating and positive — students may be stressed about exams. Keep responses clear, concise, and encouraging.`,
    },
    {
      name: 'Watmall',
      slug: 'watmall',
      keywords: [
        'watmall', 'wat mall', 'watmall.com', 'shop', 'shopping', 'buy',
        'order', 'product', 'delivery', 'item', 'price', 'store', 'purchase',
        'marketplace', 'vendor', 'seller', 'cart', 'checkout', 'refund', 'return',
      ],
      systemPrompt: `You are a helpful and responsive customer care agent for Watmall (watmall.com).

Watmall is an online marketplace where customers can shop for a wide range of products and have them delivered.

Your responsibilities:
- Help customers track their orders and deliveries
- Assist with product inquiries, availability, and pricing
- Handle complaints about wrong items, damaged goods, or delayed deliveries
- Guide customers through the checkout and payment process
- Assist vendors/sellers with listing and account questions

Key information:
- Website: https://watmall.com
- Customers can shop from multiple vendors on the platform
- Delivery timelines vary by location

Always be professional, empathetic, and solution-focused. For order-specific issues, ask for the order number to assist effectively.`,
    },
    {
      name: 'Payapp',
      slug: 'payapp',
      keywords: [
        'payapp', 'pay app', 'payapp.ng', 'payment', 'transfer', 'pay',
        'wallet', 'transaction', 'send money', 'receive money', 'fund',
        'withdraw', 'bank transfer', 'airtime', 'bills', 'fintech',
        'account', 'balance', 'top up',
      ],
      systemPrompt: `You are a professional and security-conscious customer care agent for Payapp (payapp.ng).

Payapp is a Nigerian fintech payment platform that enables users to send money, receive payments, pay bills, buy airtime, and manage their finances.

Your responsibilities:
- Help users with failed or pending transactions
- Guide users on how to fund their wallet, withdraw, and transfer funds
- Assist with account verification and KYC issues
- Help with bill payments (electricity, internet, TV subscriptions, airtime)
- Handle complaints about incorrect debits or missing credits

Key information:
- Website: https://payapp.ng
- All transactions are secured and encrypted
- For security reasons, NEVER ask for or share passwords, PINs, or OTPs

IMPORTANT SECURITY RULES:
- Never request a user's PIN, password, or OTP
- Warn users that Payapp staff will never ask for their PIN
- Escalate fraud complaints immediately

Be calm, professional, and reassuring — especially for transaction issues which can be stressful.`,
    },
    {
      name: 'Realtour',
      slug: 'realtour',
      keywords: [
        'realtour', 'real tour', 'realtour.ng', 'property', 'house', 'rent',
        'buy property', 'real estate', 'tour', 'apartment', 'land', 'shortlet',
        'listing', 'agent', 'landlord', 'tenant', 'lease', 'duplex', 'flat',
        'bungalow', 'commercial property', 'estate',
      ],
      systemPrompt: `You are a knowledgeable and courteous customer care agent for Realtour (realtour.ng).

Realtour is a Nigerian real estate platform that connects property buyers, renters, and sellers. Users can browse property listings, schedule tours, and connect with verified agents.

Your responsibilities:
- Help users find properties to buy, rent, or lease
- Assist with scheduling property tours and viewings
- Connect users with verified real estate agents
- Handle listing inquiries for landlords and property owners
- Explain the process for buying, renting, or listing a property

Key information:
- Website: https://realtour.ng
- Covers residential and commercial properties across Nigeria
- Features verified agent profiles and virtual tours

Be professional, warm, and knowledgeable. Real estate decisions are significant — take time to understand each user's needs before responding.`,
    },
    {
      name: 'Stanet Academy',
      slug: 'stanet-academy',
      keywords: [
        'stanet', 'stanet academy', 'ict', 'academy', 'course', 'training',
        'computer', 'tech', 'learn', 'class', 'certificate', 'it training',
        'coding', 'programming', 'digital skills', 'web design', 'networking',
        'cybersecurity', 'data', 'software', 'enroll', 'enrollment', 'batch',
      ],
      systemPrompt: `You are a friendly and professional customer care agent for Stanet Academy.

Stanet Academy is an ICT training institution that provides hands-on technology education including programming, web design, networking, cybersecurity, data analysis, and other digital skills.

Your responsibilities:
- Provide information about available courses and training programs
- Help prospective students with enrollment and registration
- Share details about class schedules, duration, fees, and certifications
- Assist current students with course access and learning materials
- Answer questions about online vs physical classes and batch schedules

Key information:
- Courses cover: Programming, Web Design, Networking, Cybersecurity, Data Analysis, Microsoft Office, Graphics Design, and more
- Certifications are issued upon course completion
- Training available for beginners and advanced learners

Be encouraging and enthusiastic about technology education. Help users identify the right course for their goals and career path.`,
    },
  ]

  for (const brand of brands) {
    const existing = await prisma.brand.findUnique({ where: { slug: brand.slug } })
    const created = await prisma.brand.upsert({
      where: { slug: brand.slug },
      // On update: never overwrite systemPrompt — preserve any edits made via dashboard
      update: {
        name: brand.name,
        keywords: brand.keywords,
      },
      create: { ...brand, language: 'en' },
    })
    console.log(`✓ Brand: ${created.name} (${created.id})`)

    // Welcome follow-up template
    const template = await prisma.messageTemplate.upsert({
      where: { id: `tmpl-welcome-${created.slug}` },
      update: { body: `Hi {{name}}! 👋 We noticed you reached out to ${created.name} earlier. Were we able to help you? Feel free to reply if you need anything else — we're always here!` },
      create: {
        id: `tmpl-welcome-${created.slug}`,
        brandId: created.id,
        name: 'Follow-up (2hrs)',
        body: `Hi {{name}}! 👋 We noticed you reached out to ${created.name} earlier. Were we able to help you? Feel free to reply if you need anything else — we're always here!`,
        variables: ['name'],
      },
    })

    // Automation rule: follow up 2 hours after conversation opens
    await prisma.automationRule.upsert({
      where: { id: `rule-welcome-${created.slug}` },
      update: {},
      create: {
        id: `rule-welcome-${created.slug}`,
        brandId: created.id,
        name: 'Follow-up after 2 hours',
        triggerEvent: 'CONVERSATION_OPENED',
        delayMinutes: 120,
        templateId: template.id,
        isActive: true,
      },
    })
  }

  // ── Welcome Quick Replies ─────────────────────────────────────────────────
  console.log('\nSeeding welcome quick replies...')

  const welcomeReplies: Record<string, { message: string }> = {
    'blazingprojects': {
      message: `Hello! 👋 Welcome to *BlazingProjects*!

I'm here to assist you with your academic research needs.

What would you like help with today?

- 🔍 Search for a project in your field of study?
- 📥 Access a purchased project?
- 💳 Payment or order support?
- 📚 Learn about our research materials?

Please tell me how I can help! 😊`,
    },
    'examkits': {
      message: `Hello! 👋 Welcome to *ExamKits*!

I'm here to help you prepare and ace your exams! 🎯

What can I help you with today?

- 📝 Find past questions for JAMB, WAEC, NECO or Post UTME?
- 🖥️ Access your CBT practice account?
- 💳 Payment or subscription support?
- 📚 Choose the right exam prep package?

Let me know and I'll get you sorted! 💪`,
    },
    'watmall': {
      message: `Hello! 👋 Welcome to *Watmall*!

Your one-stop online shopping destination 🛒

How can I assist you today?

- 🔍 Find a product or check availability?
- 📦 Track an existing order?
- 💳 Payment or checkout support?
- 🔄 Return or refund request?

Tell me what you need and I'll help right away! 😊`,
    },
    'payapp': {
      message: `Hello! 👋 Welcome to *Payapp*!

Your trusted payment and money transfer platform 💳

How can I help you today?

- 💸 Send or receive money?
- 📱 Buy airtime or pay bills?
- ❓ Transaction issue or failed payment?
- 🔐 Account verification or access?

Please share your request and I'll assist you immediately! 🙂

⚠️ *Security Note:* Payapp staff will NEVER ask for your PIN or OTP.`,
    },
    'realtour': {
      message: `Hello! 👋 Welcome to *Realtour*!

Nigeria's trusted real estate platform 🏠

What are you looking for today?

- 🏠 Find a property to buy or rent?
- 📅 Schedule a property viewing or tour?
- 🏢 List your property for sale or rent?
- 🤝 Connect with a verified agent?

Let me help you find your perfect property! 😊`,
    },
    'stanet-academy': {
      message: `Hello! 👋 Welcome to *Stanet Academy*!

Your gateway to world-class ICT training 💻

What would you like to know?

- 📚 View available courses and programs?
- 📝 Enroll in a course or training?
- 📅 Check class schedules and fees?
- 🎓 Learn about certifications?

Tell me your interest and I'll guide you! 🚀`,
    },
  }

  const greetingKeywords = [
    'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
    'howdy', 'hiya', 'greetings', 'sup', 'whatsup', 'what\'s up',
    'morning', 'afternoon', 'evening', 'hi there', 'hello there',
    'start', 'begin', 'help', 'info', 'information', 'enquire', 'enquiry',
    'inquire', 'inquiry', 'interested', 'welcome',
  ]

  for (const brand of await prisma.brand.findMany()) {
    const welcome = welcomeReplies[brand.slug]
    if (!welcome) continue

    // Check if a welcome quick reply already exists for this brand
    const existing = await prisma.quickReply.findFirst({
      where: { brandId: brand.id, name: 'Welcome Message' },
    })

    if (!existing) {
      const qr = await prisma.quickReply.create({
        data: {
          brandId: brand.id,
          name: 'Welcome Message',
          keywords: greetingKeywords,
          matchType: 'ANY',
          isActive: true,
          messages: {
            create: [{ body: welcome.message, delaySeconds: 0, order: 0 }],
          },
        },
      })
      console.log(`✓ Welcome quick reply: ${brand.name} (${qr.id})`)
    } else {
      console.log(`→ Welcome quick reply already exists: ${brand.name} — skipping`)
    }
  }

  console.log('\n✅ Seed complete!')
  console.log('→ Login: http://localhost:3000/login')
  console.log('→ Email: admin@company.com | Password: admin123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
