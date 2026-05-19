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

## Development Workflow

Follow these steps for every implementation:

1. **Query Context7 first** — before writing any code, call `mcp__context7` to get up-to-date best practices and API docs for the relevant library or framework (Next.js, Prisma, Auth.js, Recharts, etc.). Do not rely solely on training data — library APIs change across versions.
2. **Update `CLAUDE.md`** — after implementing, reflect every new file, route, component, and design decision in the File Structure and Key Design Decisions sections of this file.
3. **Update `TUTORIAL.md`** — add or update the relevant section to document the feature: what was built, key files, how it works, and any gotchas encountered.

## Architecture

### Request Flow

1. `src/proxy.ts` — Next.js 16 middleware (exported as `proxy`, not `middleware`). Guards `/dashboard/*` and redirects unauthenticated requests to `/login`.
2. `src/lib/auth.ts` — Auth.js v5 config with Credentials provider + JWT strategy. Injects `id` and `role` into the JWT token and session.
3. API routes in `src/app/api/` — always filter by `userId` from the server-side session, never trust client-provided user IDs.

### Key Design Decisions

- **Next.js 16 proxy file**: middleware is `src/proxy.ts` with `export async function proxy` — Next.js 16 deprecated `middleware.ts` in favor of `proxy.ts`. **NEVER create or use `middleware.ts`** — having both files causes conflict. Only `proxy.ts` must exist.
- **Prisma 7 + PostgreSQL**: requires `@prisma/adapter-pg` and `PrismaPg` adapter (not the legacy direct connection). The singleton is in `src/lib/prisma.ts`.
- **PM (average cost) calculation**: computed at runtime from full transaction history in `src/lib/portfolio.ts`. SELL reduces quantity but does not change the average cost of remaining shares.
- **Portfolio history**: lazy daily snapshot — triggered client-side after quotes load, via `POST /api/snapshot`. Stored in `PortfolioHistory`. No cron, no background worker.
- **Finnhub quotes**: fetched in `src/lib/finnhub.ts`, polled every 5 minutes client-side via `/api/quotes`. API key via `FINNHUB_API_KEY` env var. Free tier — avoid unnecessary calls.
- **Recharts + SSR**: Recharts uses browser APIs that fail during SSR. Use a `mounted` state (`useState(false)` + `useEffect(() => setMounted(true), [])`) and only render charts after mount.
- **Admin authorization**: both the page (`/dashboard/admin/page.tsx`) and every `/api/users` route check `session.user.role === "ADMIN"` — page redirects to `/dashboard`, API returns 403. Deleting a user requires manually deleting their `PortfolioHistory` and `Transaction` records first (no cascade in schema).
- **Quote lookup in modal**: `transaction-modal.tsx` calls `/api/quotes?tickers=X` on `onBlur` of the Ticker field. Shows "current: $X.XX" hint with a "use" button that fills the Price field. Clears on ticker change or modal reopen.
- **Transactions list with live quotes**: `transactions-client.tsx` fetches quotes for all unique tickers on mount, polls every 5 min. Adds `Current Value` (qty × current price) and `P&L` (only for BUY rows: current value − paid) columns. The server component (`transactions/page.tsx`) only fetches DB rows and passes them as props.
- **Brokerage field**: `Transaction` has an optional `brokerage String?` column (DB only — no UI field). Always `null` for new transactions and imports.
- **CSV/Excel import**: `papaparse` parses CSV with `delimiter: ";"` (semicolon-separated); `xlsx` parses Excel. Expected columns: `Date` (YYYY-MM-DD), `Type` (`buy`/`sell`, mapped to `BUY`/`SELL`), `Ticker`, `Quantity` (dot decimal), `Price (USD)` (dot decimal, comma thousands separator removed). Unknown columns are ignored. Rows missing required fields are returned in the `invalid` array with a reason string. A "Download sample file" button on the import page generates a valid sample CSV client-side via Blob URL.

### Data Models

Three models: `User` (with `role: ADMIN | USER`), `Transaction` (BUY/SELL per ticker, `date` required, `brokerage String?` unused in UI), `PortfolioHistory` (daily total value snapshots).

### Rendering Strategy

Server Components by default. Use `"use client"` only for forms, charts (Recharts), and interactive UI.

## File Structure

```
src/
  app/
    api/
      auth/[...nextauth]/route.ts   # Auth.js handlers
      quotes/route.ts               # GET /api/quotes?tickers=AAPL,MSFT — Finnhub proxy
      snapshot/route.ts             # POST /api/snapshot — save daily portfolio history (called client-side after quotes load)
      transactions/route.ts         # GET + POST /api/transactions
      transactions/
        [id]/route.ts               # PATCH (edit) + DELETE /api/transactions/[id] — ownership verified via userId
      import/
        preview/route.ts            # POST /api/import/preview — parse CSV/Excel, return valid + invalid rows
        confirm/route.ts            # POST /api/import/confirm — bulk insert validated rows
      users/
        route.ts                    # POST /api/users — create user (ADMIN only)
        [id]/route.ts               # DELETE /api/users/[id] — delete user; PATCH — reset password (ADMIN only)
    dashboard/
      layout.tsx                    # Auth check + Navbar
      page.tsx                      # Portfolio page (server component)
      transactions/page.tsx         # Transactions list + add modal
      import/page.tsx               # CSV/Excel import (shell — delegates to ImportClient)
      admin/page.tsx                # User management — ADMIN only; redirects non-admins to /dashboard
    login/page.tsx
    layout.tsx
    globals.css
    page.tsx                          # Root page — checks auth, redirects to /dashboard (logged in) or /login (not logged in)
  components/
    navbar.tsx                      # Sticky nav with tab links + sign out
    portfolio-client.tsx            # Client: cards, pie chart, line chart, positions table, quote polling
    providers.tsx                   # SessionProvider wrapper
    transaction-modal.tsx           # Client: "Add Transaction" button + modal form; fetches quote onBlur of Ticker field
    transactions-client.tsx         # Client: transactions table with quote polling; columns Paid, Current Value, P&L; edit modal + delete confirm per row
    import-client.tsx               # Client: file upload, preview table, conflict warning, confirm button
    admin-client.tsx                # Client: user table, create/delete/reset-password modals (ADMIN only)
  lib/
    auth.ts                         # Auth.js v5 config
    finnhub.ts                      # Finnhub client — getQuote/getQuotes with 5-min in-memory cache
    portfolio.ts                    # computePositions(transactions) — PM calculation
    prisma.ts                       # Prisma singleton
  types/
    next-auth.d.ts                  # Session type augmentation (id + role)
  proxy.ts                          # Route protection middleware (guards /dashboard/*, redirects to /login)
prisma/
  schema.prisma
  seed.ts
  migrations/
prisma.config.ts
playwright.config.ts
tests/
  auth.setup.ts          # saves playwright/.auth/admin.json + user.json (setup project)
  auth.spec.ts           # unauthenticated flows: redirect, login, logout
  transactions.spec.ts   # user-auth: list, add transaction modal
  import.spec.ts         # user-auth: CSV upload, preview, confirm
  admin.spec.ts          # admin-auth: user list, CRUD, role redirect
  fixtures/
    sample.csv           # 3-row test CSV for import tests
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
