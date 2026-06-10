FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vars dummy só para prisma generate e next build (sem conexão real no build)
ENV DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy \
    AUTH_SECRET=build-time-dummy \
    NEXTAUTH_SECRET=build-time-dummy \
    NEXTAUTH_URL=http://localhost:3000
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Standalone contém apenas os node_modules rastreados pelo Next.js (pg, @prisma/client, etc.)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
