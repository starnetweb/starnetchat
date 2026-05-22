FROM node:20-alpine

RUN npm install -g pnpm ts-node typescript

WORKDIR /app

COPY . .
RUN pnpm install

# Generate Prisma client
RUN cd packages/db && npx prisma generate

RUN mkdir -p /app/apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["ts-node", "--transpile-only", "src/index.ts"]
