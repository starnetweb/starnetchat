FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy workspace config + all package.json files first (layer caching)
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

COPY packages/db/package.json         ./packages/db/
COPY packages/whatsapp/package.json   ./packages/whatsapp/
COPY packages/ai/package.json         ./packages/ai/
COPY packages/queue/package.json      ./packages/queue/
COPY apps/api/package.json            ./apps/api/

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source files
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Create uploads directory
RUN mkdir -p /app/apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["npx", "ts-node", "--transpile-only", "src/index.ts"]
