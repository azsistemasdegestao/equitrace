# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Equitrace** — a mobile-first foreign asset wallet app for tracking US stock exchange investments (NYSE/NASDAQ). Users log buy/sell transactions, track average cost (PM), and visualize portfolio history.

## Commands

```bash
npm run dev       # start dev server (localhost:3000)
npm run build     # production build
npm run lint      # ESLint
npx prisma migrate dev        # run migrations
npx prisma migrate dev --name <name>  # create + run a new migration
npx prisma studio             # GUI for the database
tsx prisma/seed.ts            # seed admin user (admin@wallet.com / admin123)
```

## Architecture

### Request Flow

1. `src/proxy.ts` — Next.js 16 middleware (exported as `proxy`, not `middleware`). Guards `/dashboard/*` and redirects unauthenticated requests to `/login`.
2. `src/lib/auth.ts` — Auth.js v5 config with Credentials provider + JWT strategy. Injects `id` and `role` into the JWT token and session.
3. API routes in `src/app/api/` — always filter by `userId` from the server-side session, never trust client-provided user IDs.

### Key Design Decisions

- **Next.js 16 proxy file**: middleware is `src/proxy.ts` with `export async function proxy` — Next.js 16 renamed `middleware.ts` to `proxy.ts`.
- **Prisma 7 + PostgreSQL**: requires `@prisma/adapter-pg` and `PrismaPg` adapter (not the legacy direct connection). The singleton is in `src/lib/prisma.ts`.
- **PM (average cost) calculation**: computed at runtime from full transaction history in `src/lib/portfolio.ts`. SELL reduces quantity but does not change the average cost of remaining shares.
- **Portfolio history**: lazy daily snapshot — triggered on the first dashboard request each day, stored in `PortfolioHistory`. No cron, no historical quotes.
- **Finnhub quotes**: fetched in `src/lib/finnhub.ts`, polled every 5 minutes client-side. API key via `FINNHUB_API_KEY` env var. Free tier — avoid unnecessary calls.

### Data Models

Three models: `User` (with `role: ADMIN | USER`), `Transaction` (BUY/SELL per ticker with `date` required), `PortfolioHistory` (daily total value snapshots).

### Rendering Strategy

Server Components by default. Use `"use client"` only for forms, charts (Recharts), and interactive UI.

## Styling Rules

- Dark theme only — no light mode.
- `bg-black` for page background, `bg-zinc-900` for surfaces, `border-zinc-800` for borders.
- `text-zinc-400` for secondary text, white for primary.
- Mobile-first layouts, `max-w-4xl mx-auto` for max content width.
- Active nav tab: `border-b-2 border-white`.

## Environment Variables

```env
DATABASE_URL="postgresql://wallet:wallet123@localhost:5432/wallet_dev"
AUTH_SECRET="..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
FINNHUB_API_KEY="..."
```
