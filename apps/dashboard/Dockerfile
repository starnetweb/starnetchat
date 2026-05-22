FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

# Copy entire monorepo
COPY . .

# Install all dependencies from root
RUN pnpm install

# Build Next.js
ENV NODE_OPTIONS="--max-old-space-size=4096"
WORKDIR /app/apps/dashboard
RUN npx next build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN npm install -g pnpm

WORKDIR /app

COPY . .
RUN pnpm install --prod

COPY --from=builder /app/apps/dashboard/.next ./apps/dashboard/.next

WORKDIR /app/apps/dashboard

EXPOSE 3000

CMD ["npx", "next", "start"]
