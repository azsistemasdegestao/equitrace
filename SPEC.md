# Equitrace — Project Specification

## Overview

Equitrace is a mobile-first foreign asset wallet app for tracking investments on US stock exchanges (NYSE/NASDAQ). It supports stocks, ETFs, and REITs. Users can log buy/sell transactions, view their average cost, see current portfolio positions with real-time quotes, and visualize portfolio history over time.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| CSS | Tailwind CSS (dark theme, mobile-first) |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 |
| Auth | Auth.js v5 (`next-auth@beta`) |
| Charts | Recharts |
| Quotes API | Finnhub (real-time, free tier) |
| Runtime | Node.js 22 |
| Deploy | Docker on Hostinger VM |

---

## Design Rules

- **Language:** All UI text must be in English.
- **Theme:** Dark only. Background `bg-black`, surfaces `bg-zinc-900`, borders `border-zinc-800`.
- **Mobile-first:** All layouts start from mobile and scale up. Max content width `max-w-4xl mx-auto`.
- **Typography:** Zinc scale for secondary text (`text-zinc-400`), white for primary.
- **No light mode.**

---

## Authentication & Authorization

- Auth.js v5 with JWT strategy and Credentials provider.
- Roles: `ADMIN` and `USER`.
- Admin is created via seed script (`prisma/seed.ts`).
- Admin can create new users and manage accounts.
- Users can change their own password via the gear icon (⚙) modal in the navbar. Must provide the correct current password.
- All `/dashboard/*` routes are protected via `src/proxy.ts`.
- Users cannot access other users' data under any circumstances.

---

## Database Models

```prisma
model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  password  String   // bcrypt hashed
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  transactions     Transaction[]
  portfolioHistory PortfolioHistory[]
}

model Transaction {
  id        String          @id @default(cuid())
  userId    String
  ticker    String
  type      TransactionType // BUY or SELL
  quantity  Decimal
  price     Decimal         // in USD
  date      DateTime        // transaction date, required
  createdAt DateTime        @default(now())

  user User @relation(fields: [userId], references: [id])
}

model PortfolioHistory {
  id         String   @id @default(cuid())
  userId     String
  totalValue Decimal  // in USD
  snapshotAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

enum Role {
  ADMIN
  USER
}

enum TransactionType {
  BUY
  SELL
}
```

---

## Average Cost Calculation

- Average cost is calculated at runtime from the full transaction history per ticker.
- Formula: total cost of remaining shares / remaining shares.
- SELL transactions reduce the quantity but do not change the average cost of remaining shares.
- All values are in USD.

---

## Quotes

- Provider: **Finnhub** (`https://finnhub.io`)
- Quotes are fetched on page load and refreshed every 5 minutes via polling.
- No WebSocket or streaming.
- Store quote cache in memory or a simple server-side cache.
- Environment variable: `FINNHUB_API_KEY`.

---

## Pages & Features

### `/login`
- Email + password form.
- Redirects to `/dashboard` on success.
- Redirects authenticated users away from `/login`.

### `/dashboard` (Portfolio)
- Summary cards: Total Value (USD), number of assets.
- Pie chart: portfolio distribution by ticker.
- Line chart: portfolio value over time (built from `PortfolioHistory`, starts from first use).
- Table: position per ticker with columns — Ticker, Quantity, Avg Cost, Current Price, Current Value, P&L (%).

### `/dashboard/transactions`
- List of all transactions for the logged-in user, sorted by date descending.
- Columns: Date, Ticker, Type (BUY/SELL), Quantity, Price, Total.
- Button to add a new transaction (modal or inline form).
- Transaction form fields: Ticker, Type, Quantity, Price (USD), Date.
- **Ticker search**: the Ticker input has a magnifying glass icon. Typing 1+ characters triggers a debounced call to `GET /api/search?q=` (Finnhub symbol search), showing a dropdown with symbol + company name. Selecting a result fills the Ticker and auto-fetches the current quote.

### `/dashboard/import`
- Upload CSV or Excel file.
- Parse and show a preview table before importing.
- Required columns: `date`, `ticker`, `type`, `quantity`, `price`.
- On conflict (ticker already has transactions): show preview and let user decide to merge or skip.
- Date is a required field — reject rows without a valid date.

### `/dashboard/admin` (Admin only)
- List of all users.
- Create new user form: name, email, password, role.
- Delete user.
- Reset user password.

---

## Navigation

- Sticky top navbar with app name "Equitrace", gear icon (⚙) for change password, and Sign out button.
- Nav tabs: Portfolio, Transactions, Import, Admin (admin only).
- Active tab highlighted with `border-b-2 border-white`.
- Gear icon opens the Change Password modal (available to all authenticated users).

---

## Portfolio History (Line Chart)

- A daily snapshot of the user's total portfolio value is saved to `PortfolioHistory`.
- Snapshot is triggered on the first request of each day (lazy snapshot, not a cron job).
- History starts from the first day the user accesses the dashboard.
- No historical quote fetching — only current quotes are used.

---

## File Structure

```
src/
  app/
    api/
      auth/
        [...nextauth]/
          route.ts
      transactions/
        route.ts
      search/
        route.ts
      profile/
        route.ts
      users/
        route.ts
    dashboard/
      layout.tsx
      page.tsx               # Portfolio
      transactions/
        page.tsx
      import/
        page.tsx
      admin/
        page.tsx
    login/
      page.tsx
    layout.tsx
    globals.css
    page.tsx
  components/
    navbar.tsx
    providers.tsx
  lib/
    auth.ts
    prisma.ts
    finnhub.ts               # Finnhub API client
    portfolio.ts             # average cost calculation logic
  types/
    next-auth.d.ts
  proxy.ts
prisma/
  schema.prisma
  seed.ts
  migrations/
prisma.config.ts
.env
SPEC.md
```

---

## Environment Variables

```env
DATABASE_URL="postgresql://wallet:wallet123@localhost:5432/wallet_dev"
AUTH_SECRET="..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
FINNHUB_API_KEY="..."
```

---

## Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auth strategy | JWT | Stateless, no DB session table needed |
| Prisma adapter | `@prisma/adapter-pg` | Required by Prisma 7 for PostgreSQL |
| Middleware file | `proxy.ts` (not `middleware.ts`) | Next.js 16 renamed middleware to proxy |
| Proxy export | `export async function proxy` | Next.js 16 requires this exact name |
| Ticker search | Finnhub `/search` via `/api/search` | Prevents typos; filtered to US Common Stock (no foreign-exchange suffixes) |
| Average cost calculation | Runtime from transactions | Always accurate, no denormalization |
| Portfolio history | Lazy daily snapshot | Avoids cron jobs, no historical quotes needed |
| Quote refresh | Polling every 5 min | Simple, fits Finnhub free tier limits |
| CSV import | Preview before insert | User controls conflict resolution |
| User isolation | `userId` filter on all queries | No cross-user data access |

---

## Coding Conventions

- All API routes go in `src/app/api/`.
- Always filter queries by `userId` from the session — never trust client-provided user IDs.
- Use `src/lib/prisma.ts` singleton for all database access.
- Use `src/lib/portfolio.ts` for average cost calculation logic.
- Use `src/lib/finnhub.ts` for all quote fetching.
- Server Components by default; use `"use client"` only when needed (forms, charts, interactive UI).
- Never expose passwords or sensitive fields in API responses.