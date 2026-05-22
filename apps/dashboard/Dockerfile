FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace config + all package.json files (layer caching)
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

COPY packages/db/package.json         ./packages/db/
COPY packages/whatsapp/package.json   ./packages/whatsapp/
COPY packages/ai/package.json         ./packages/ai/
COPY packages/queue/package.json      ./packages/queue/
COPY apps/dashboard/package.json      ./apps/dashboard/

RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/dashboard/ ./apps/dashboard/

WORKDIR /app/apps/dashboard

# Build Next.js for production
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npx next build

# ── Runtime image (smaller) ───────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY packages/db/package.json         ./packages/db/
COPY apps/dashboard/package.json      ./apps/dashboard/

RUN pnpm install --no-frozen-lockfile --prod

COPY --from=builder /app/apps/dashboard/.next      ./apps/dashboard/.next
COPY --from=builder /app/apps/dashboard/public     ./apps/dashboard/public
COPY --from=builder /app/apps/dashboard/next.config.js ./apps/dashboard/next.config.js

WORKDIR /app/apps/dashboard

EXPOSE 3000

CMD ["npx", "next", "start"]
