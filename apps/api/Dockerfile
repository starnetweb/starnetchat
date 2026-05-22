FROM node:20

RUN npm install -g pnpm tsx

WORKDIR /app

COPY . .
RUN pnpm install --no-frozen-lockfile

# Generate Prisma client (Debian/bookworm — OpenSSL 3.x)
RUN cd packages/db && npx prisma generate

RUN mkdir -p /app/apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["tsx", "src/index.ts"]
