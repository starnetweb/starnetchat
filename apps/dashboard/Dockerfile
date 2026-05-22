FROM node:20-alpine

RUN npm install -g pnpm

WORKDIR /app

# Copy entire monorepo and install
COPY . .
RUN pnpm install

WORKDIR /app/apps/dashboard

EXPOSE 3000

CMD ["npx", "next", "dev"]
