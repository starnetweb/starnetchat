FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy entire monorepo
COPY . .

# Install all dependencies from root
RUN pnpm install

# Generate Prisma client
RUN cd packages/db && npx prisma generate

# Create uploads directory
RUN mkdir -p /app/apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["npx", "ts-node", "--transpile-only", "src/index.ts"]
