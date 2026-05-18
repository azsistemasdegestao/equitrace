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
- **Finnhub quotes**: fetched in `src/lib/finnhub.ts`, polled every 5 minutes client-side via `/api/quotes`. API key via `FINNHUB_API_KEY` env var. Free tier — avoid unnecessary calls.
- **Recharts + SSR**: Recharts uses browser APIs that fail during SSR. Use a `mounted` state (`useState(false)` + `useEffect(() => setMounted(true), [])`) and only render charts after mount.
- **CSV/Excel import**: `papaparse` parses CSV; `xlsx` parses Excel. Column names are case-insensitive. `DATA` uses MM/DD/YYYY format. `Operation` is normalized to uppercase BUY/SELL. `PRINCIPAL` and `BROKERAGE` columns are ignored. Rows missing required fields are returned in the `invalid` array with a reason string.

### Data Models

Three models: `User` (with `role: ADMIN | USER`), `Transaction` (BUY/SELL per ticker with `date` required), `PortfolioHistory` (daily total value snapshots).

### Rendering Strategy

Server Components by default. Use `"use client"` only for forms, charts (Recharts), and interactive UI.

## File Structure

```
src/
  app/
    api/
      auth/[...nextauth]/route.ts   # Auth.js handlers
      quotes/route.ts               # GET /api/quotes?tickers=AAPL,MSFT — Finnhub proxy
      transactions/route.ts         # GET + POST /api/transactions
      import/
        preview/route.ts            # POST /api/import/preview — parse CSV/Excel, return valid + invalid rows
        confirm/route.ts            # POST /api/import/confirm — bulk insert validated rows
    dashboard/
      layout.tsx                    # Auth check + Navbar
      page.tsx                      # Portfolio page (server component)
      transactions/page.tsx         # Transactions list + add modal
      import/page.tsx               # CSV/Excel import (shell — delegates to ImportClient)
      admin/page.tsx                # TODO: Admin — user management
    login/page.tsx
    layout.tsx
    globals.css
    page.tsx
  components/
    navbar.tsx                      # Sticky nav with tab links + sign out
    portfolio-client.tsx            # Client: cards, pie chart, line chart, positions table, quote polling
    providers.tsx                   # SessionProvider wrapper
    transaction-modal.tsx           # Client: "Add Transaction" button + modal form
    import-client.tsx               # Client: file upload, preview table, conflict warning, confirm button
  lib/
    auth.ts                         # Auth.js v5 config
    finnhub.ts                      # Finnhub client — getQuote/getQuotes with 5-min in-memory cache
    portfolio.ts                    # computePositions(transactions) — PM calculation
    prisma.ts                       # Prisma singleton
  types/
    next-auth.d.ts                  # Session type augmentation (id + role)
  proxy.ts                          # Route protection middleware
prisma/
  schema.prisma
  seed.ts
  migrations/
prisma.config.ts
.env
```

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
