# Wallet Exterior — Setup Guide

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| CSS | Tailwind CSS |
| ORM | Prisma 7 |
| Database | PostgreSQL 16 |
| Auth | Auth.js v5 (next-auth@beta) |
| Runtime | Node.js 22 via NVM |
| Environment | WSL2 (Ubuntu) + Docker Desktop |

---

## 1. Environment Setup

### Install Ubuntu on WSL2
```powershell
wsl --install -d Ubuntu
```

### Install Node.js via NVM (inside Ubuntu)
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Reopen terminal
nvm install 22
```

---

## 2. Create Next.js Project

```bash
cd ~
npx create-next-app@latest wallet-exterior
```

**Options selected:**

| Option | Choice |
|---|---|
| Recommended defaults | No |
| TypeScript | Yes |
| Linter | ESLint |
| React Compiler | No |
| Tailwind CSS | Yes |
| src/ directory | Yes |
| App Router | Yes |
| Customize import alias | No |
| AGENTS.md | No |

---

## 3. Start PostgreSQL via Docker

```bash
docker run --name wallet-postgres \
  -e POSTGRES_USER=wallet \
  -e POSTGRES_PASSWORD=wallet123 \
  -e POSTGRES_DB=wallet_dev \
  -p 5432:5432 \
  -d postgres:16
```

> If permission denied: `sudo usermod -aG docker $USER` then reopen terminal.

---

## 4. Install Dependencies

```bash
npm install prisma @prisma/client next-auth@beta recharts bcryptjs @prisma/adapter-pg pg dotenv
npm install -D @types/bcryptjs @types/pg tsx
```

---

## 5. Initialize Prisma

```bash
npx prisma init
```

### `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  password  String
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
  type      TransactionType
  quantity  Decimal
  price     Decimal
  date      DateTime
  createdAt DateTime        @default(now())

  user User @relation(fields: [userId], references: [id])
}

model PortfolioHistory {
  id         String   @id @default(cuid())
  userId     String
  totalValue Decimal
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

### `prisma.config.ts`
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

### `.env`
```env
DATABASE_URL="postgresql://wallet:wallet123@localhost:5432/wallet_dev"
AUTH_SECRET="dev-secret-troca-na-producao"
NEXTAUTH_SECRET="dev-secret-troca-na-producao"
NEXTAUTH_URL="http://localhost:3000"
```

> ⚠️ Never commit `.env` to Git. Confirm it is in `.gitignore`.

---

## 6. Run Migrations and Generate Client

```bash
npx prisma migrate dev --name init
npx prisma generate
```

> In Prisma 7, `prisma generate` must be run manually — it no longer runs automatically after migrations.

---

## 7. Seed Admin User

### `prisma/seed.ts`
```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@wallet.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@wallet.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log("Admin user created:", admin.email);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

```bash
npx prisma db seed
```

**Default admin credentials:**
- Email: `admin@wallet.com`
- Password: `admin123`

---

## 8. Project File Structure

```
src/
  app/
    api/
      auth/
        [...nextauth]/
          route.ts              # Auth.js handlers (GET + POST)
      quotes/
        route.ts                # GET /api/quotes?tickers=AAPL,MSFT
      transactions/
        route.ts                # GET + POST /api/transactions
      import/
        preview/
          route.ts              # POST /api/import/preview
        confirm/
          route.ts              # POST /api/import/confirm
    dashboard/
      layout.tsx                # Auth check + Navbar wrapper
      page.tsx                  # Portfolio (server component)
      transactions/
        page.tsx                # Transactions list + add modal
      import/
        page.tsx                # CSV/Excel import
      admin/
        page.tsx                # TODO: Admin user management
    login/
      page.tsx
    layout.tsx
    globals.css
    page.tsx
  components/
    navbar.tsx                  # Sticky top nav with tabs
    portfolio-client.tsx        # Client: charts + table + quote polling
    providers.tsx               # SessionProvider wrapper
    transaction-modal.tsx       # Client: add transaction button + modal
    import-client.tsx           # Client: file upload, preview, confirm import
  lib/
    auth.ts
    finnhub.ts                  # Finnhub client with in-memory cache
    portfolio.ts                # computePositions — PM calculation
    prisma.ts
  types/
    next-auth.d.ts
  proxy.ts
prisma/
  schema.prisma
  seed.ts
  migrations/
prisma.config.ts
.env
```

---

## 9. Key Files

### `src/lib/prisma.ts`
```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

> The global pattern prevents multiple Prisma Client instances during Next.js hot reload in development.

### `src/lib/auth.ts`
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

### `src/app/api/auth/[...nextauth]/route.ts`
```ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

### `src/components/providers.tsx`
```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

### `src/types/next-auth.d.ts`
```ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "USER";
    } & DefaultSession["user"];
  }
}
```

### `src/app/layout.tsx`
```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Providers from "@/components/providers";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Wallet Exterior",
  description: "Foreign asset wallet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-black antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### `src/proxy.ts`
```ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  });

  const isLoggedIn = !!token;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isDashboardRoute = req.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboardRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
```

> In Next.js 16, `middleware.ts` was renamed to `proxy.ts` and the exported function must be named `proxy`.

---

## 10. Key Libs Implemented

### `src/lib/portfolio.ts` — PM (Average Cost) Calculation

Processes transactions in chronological order per ticker:
- **BUY**: `totalCost += qty * price`, `totalQty += qty`
- **SELL**: PM stays the same — reduce qty and cost proportionally (`totalCost = pm * newQty`)

```ts
export function computePositions(transactions: TxInput[]): Position[] { ... }
```

### `src/lib/finnhub.ts` — Quote Fetching

Fetches current price from `https://finnhub.io/api/v1/quote?symbol=X&token=KEY`.
In-memory cache per symbol with 5-minute TTL (module-level Map — persists across requests in the same Node.js process).

```ts
export async function getQuote(symbol: string): Promise<number | null>
export async function getQuotes(symbols: string[]): Promise<Record<string, number>>
```

### `src/app/api/quotes/route.ts` — Quotes Proxy

Authenticated server-side proxy so the Finnhub API key never reaches the browser.

```
GET /api/quotes?tickers=AAPL,MSFT,VNQ
→ { "AAPL": 213.45, "MSFT": 421.10, "VNQ": 87.23 }
```

### `src/app/api/transactions/route.ts`

```
GET  /api/transactions       → list for session user, sorted by date desc
POST /api/transactions       → create transaction (userId always from session)
```

### Recharts + SSR Pattern

Recharts uses `ResizeObserver` and other browser APIs that fail during server-side rendering.
Fix: use a `mounted` flag in the client component and render charts only after hydration.

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

{mounted && <PieChart .../>}
```

### Portfolio History — Lazy Daily Snapshot

Triggered in `src/app/dashboard/page.tsx` on every dashboard load:
1. Compute current total value from positions × live quotes.
2. Check if a `PortfolioHistory` record exists for today (UTC midnight).
3. If not, create one.

No cron job needed — the snapshot happens naturally on first visit each day.

### `POST /api/import/preview` and `POST /api/import/confirm`

Two-step bulk import flow:

1. **Preview** — client uploads a file via `multipart/form-data`. Server parses it (CSV with `papaparse`, Excel with `xlsx`), normalizes rows, and returns:
   - `valid` — rows ready to insert
   - `invalid` — rejected rows with reason strings
   - `existingTickers` — tickers that already have transactions for this user (shown as a warning, not a blocker)

2. **Confirm** — client sends the `valid` array as JSON. Server inserts all rows via `prisma.transaction.createMany`. `userId` always comes from the server-side session.

**Expected file columns:** `DATA` (MM/DD/YYYY), `Operation` (buy/sell, any case), `SYM`, `QTY`, `PRICE`. Columns `PRINCIPAL` and `BROKERAGE` are ignored.

```bash
npm install papaparse xlsx
npm install -D @types/papaparse
```

---

### E2E Tests with Playwright

**Important:** Playwright does not support Ubuntu 26.04 yet. Run all tests from **Windows PowerShell**, not WSL.

**Prerequisites (Windows side):**
1. Node.js installed on Windows (`node -v` in PowerShell to verify)
2. Navigate to the project via the WSL filesystem:
   ```powershell
   cd \\wsl$\Ubuntu\home\alexa\wallet-exterior
   npm install
   npx playwright install chromium
   ```

**Running tests:**
```powershell
# Terminal 1 (WSL) — keep the dev server running
npm run dev

# Terminal 2 (PowerShell) — run the tests
npx playwright test
npx playwright test --ui          # interactive UI mode
npx playwright show-report        # open HTML report after run
```

**Test structure:**

| File | Auth | What it covers |
|---|---|---|
| `tests/auth.setup.ts` | — | Setup project: saves `admin.json` + `user.json` auth states |
| `tests/auth.spec.ts` | None | Redirect, login, invalid credentials, sign out |
| `tests/transactions.spec.ts` | User | List page, open modal, add BUY transaction |
| `tests/import.spec.ts` | User | Upload CSV, preview, confirm import |
| `tests/admin.spec.ts` | Admin | User list, create/reset/delete user, role redirect |

**Auth strategy:** The `setup` project runs once before all tests and saves `playwright/.auth/admin.json` and `playwright/.auth/user.json`. Subsequent projects reuse these storage states — no login on every test.

**DB note:** Tests run against the dev database. The `Admin — user CRUD` describe block uses `test.describe.serial` and cleans up after itself (creates then deletes `e2e-admin-test@wallet.com`). If a run is interrupted mid-way, delete that user manually via the Admin page before the next run.

---

## 11. Known Gotchas

| Issue | Cause | Fix |
|---|---|---|
| Prisma `url` deprecated in schema | Prisma 7 moved URL to config | Use `prisma.config.ts` with `env()` |
| `PrismaClient` needs adapter | Prisma 7 requires driver adapter | Use `@prisma/adapter-pg` |
| NextAuth v4 incompatible | Next.js 16 not supported | Use `next-auth@beta` (v5) |
| Middleware crypto error | Edge runtime lacks Node.js crypto | Use `proxy.ts` with `getToken` |
| `middleware.ts` deprecated | Next.js 16 renamed it | Use `proxy.ts` with `proxy` export |
| `prisma generate` not automatic | Prisma 7 breaking change | Run `npx prisma generate` manually |
| Playwright fails on Ubuntu 26.04 | Ubuntu 26.04 not yet supported | Run `npx playwright test` from Windows PowerShell |