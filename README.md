# WhatsApp Care — Multi-Brand Customer Care Agent

## Stack
- **WhatsApp**: Baileys (QR scan, companion device)
- **Backend**: Node.js + TypeScript + Express
- **AI**: Claude claude-sonnet-4-6 (per-brand system prompts + RAG)
- **Queue**: BullMQ + Redis (follow-up automation)
- **Database**: PostgreSQL + pgvector (Prisma ORM)
- **Dashboard**: Next.js 14 + Tailwind CSS + Socket.io

## Quick Start

### 1. Prerequisites
- Docker Desktop
- Node.js 20+
- pnpm (`npm i -g pnpm`)

### 2. Setup

```bash
cp .env.example .env
# Fill in your ANTHROPIC_API_KEY and other values

docker-compose up -d        # Start Postgres + Redis
pnpm install                # Install all dependencies
pnpm db:migrate             # Run DB migrations
```

### 3. Seed first admin user

```bash
cd packages/db && npx ts-node src/seed.ts
```

### 4. Run

```bash
pnpm dev   # Starts API (port 4000) + Dashboard (port 3000)
```

## Project Structure

```
whatsapp-care/
├── apps/
│   ├── api/          ← Express API + Socket.io
│   └── dashboard/    ← Next.js admin dashboard
├── packages/
│   ├── db/           ← Prisma schema + client
│   ├── whatsapp/     ← Baileys session manager
│   ├── queue/        ← BullMQ automation worker
│   └── ai/           ← Claude AI + RAG
└── docker-compose.yml
```

## Phases Remaining
- [ ] Phase 3: pgvector embeddings for proper RAG
- [ ] Phase 4: Automation rule builder UI (create/edit modal)
- [ ] Phase 5: Brand system prompt editor
- [ ] Phase 6: Analytics dashboard
- [ ] Phase 7: Human handoff / escalation flow
- [ ] Phase 8: Seed script + onboarding for 5 brands
