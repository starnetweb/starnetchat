FROM node:20

RUN npm install -g pnpm ts-node typescript tsconfig-paths

WORKDIR /app

COPY . .
RUN pnpm install --no-frozen-lockfile

# Generate Prisma client (debian/bookworm has OpenSSL 3 — use correct binary target)
RUN cd packages/db && npx prisma generate

RUN mkdir -p /app/apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "-r", "tsconfig-paths/register", "-r", "ts-node/register/transpile-only", "src/index.ts"]
