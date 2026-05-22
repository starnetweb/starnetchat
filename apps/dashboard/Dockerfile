FROM node:20

RUN npm install -g pnpm

WORKDIR /app

# Copy entire monorepo and install (including devDeps for tailwind/postcss)
COPY . .
RUN pnpm install --no-frozen-lockfile

WORKDIR /app/apps/dashboard

EXPOSE 3000

CMD ["npx", "next", "dev"]
