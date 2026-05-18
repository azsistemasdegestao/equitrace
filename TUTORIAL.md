# Equitrace — Tutorial

This document teaches you how this application was built from scratch — step by step, decision by decision. It explains not just *what* was done, but *why* every choice was made. You do not need prior knowledge of this project to follow along.

---

## Table of Contents

1. [What are we building?](#1-what-are-we-building)
2. [Technology choices and why](#2-technology-choices-and-why)
3. [Environment setup](#3-environment-setup)
4. [Creating the Next.js project](#4-creating-the-nextjs-project)
5. [Database: PostgreSQL via Docker](#5-database-postgresql-via-docker)
6. [ORM: Prisma 7](#6-orm-prisma-7)
7. [Authentication: Auth.js v5](#7-authentication-authjs-v5)
8. [Route protection: the proxy file](#8-route-protection-the-proxy-file)
9. [Dashboard layout and rendering strategy](#9-dashboard-layout-and-rendering-strategy)
10. [Average cost (PM) calculation](#10-average-cost-pm-calculation)
11. [Live quotes: Finnhub](#11-live-quotes-finnhub)
12. [Portfolio history: lazy daily snapshots](#12-portfolio-history-lazy-daily-snapshots)
13. [Charts with Recharts and the SSR trap](#13-charts-with-recharts-and-the-ssr-trap)
14. [Adding transactions](#14-adding-transactions)
15. [The Brokerage field](#15-the-brokerage-field)
16. [CSV and Excel import](#16-csv-and-excel-import)
17. [Admin: user management](#17-admin-user-management)
18. [End-to-end tests with Playwright](#18-end-to-end-tests-with-playwright)
19. [Known gotchas reference](#19-known-gotchas-reference)

---

## 1. What are we building?

**Equitrace** is a mobile-first web application for investors who buy US stocks (NYSE/NASDAQ) and want to track their portfolio over time.

The core problem it solves: Brazilian investors who invest in US assets need to track transactions in dollars, compute their average cost (called *PM* — "preço médio" in Portuguese), and see the current value of each position. Most brokerage apps don't expose this in a clean way, especially for investors who use multiple brokerages.

The main features are:

- **Authentication** — private accounts, login with email + password
- **Portfolio dashboard** — total value, allocation pie chart, portfolio history line chart, positions table with live P&L
- **Transactions** — record BUY/SELL operations manually
- **Import** — bulk import from CSV or Excel files exported from a brokerage
- **Admin** — a restricted admin area where ADMIN-role users can manage all accounts

---

## 2. Technology choices and why

Before touching any code, it is worth understanding why each technology was selected. These decisions compound: a wrong choice early forces awkward workarounds everywhere.

### Next.js 16 (App Router)

Next.js is a React meta-framework that handles routing, server rendering, API routes, and bundling in a single package. The App Router (introduced in Next.js 13 and matured in 14+) allows mixing server and client components in the same project. This is important because:

- The portfolio page fetches data from the database at request time — that is a server responsibility.
- The charts use browser-only APIs — they must run on the client.
- API routes live alongside pages without needing a separate backend server.

Version 16 is used because it is the current latest and includes performance improvements and the renamed middleware file (`proxy.ts` — more on that in chapter 8).

### TypeScript

TypeScript adds static types to JavaScript. In a project like this, it prevents an entire class of bugs: passing a `string` where a `number` is expected, forgetting a required field in a database query, or mistyping a Prisma model field. The overhead is low and the benefit is high.

### Tailwind CSS

Tailwind provides utility classes (`bg-zinc-900`, `text-white`, `rounded-xl`) that let you style components directly in JSX without writing separate CSS files. For a project with a consistent dark theme and no need for highly custom animations, Tailwind is fast to write and easy to maintain.

### Prisma 7 with PostgreSQL

Prisma is a type-safe ORM (Object Relational Mapper). Instead of writing raw SQL, you define your schema in `prisma/schema.prisma` and Prisma generates a typed client. If you rename a column in the schema, TypeScript will flag every query that still uses the old name.

PostgreSQL is used because it is reliable, widely supported, and handles `Decimal` types correctly — important for financial data where floating-point rounding errors in plain JavaScript numbers are unacceptable.

### Auth.js v5 (next-auth@beta)

Auth.js (formerly NextAuth.js) handles the entire authentication lifecycle: session creation, JWT tokens, cookie management, and provider configuration. Version 5 is required because v4 is not compatible with Next.js 14+. The beta label is somewhat misleading — it is production-ready and actively maintained.

### Recharts

Recharts is a React charting library built on SVG. It integrates cleanly with React's component model. The main caveat — which we handle explicitly in chapter 13 — is that it uses browser APIs that break during server-side rendering.

### Finnhub

Finnhub provides a free tier of real-time stock quotes via a REST API. The free tier is rate-limited, so we cache results for 5 minutes server-side, and clients poll every 5 minutes. The API key stays on the server; the browser never sees it.

---

## 3. Environment setup

The project runs on **WSL2** (Windows Subsystem for Linux 2) with Ubuntu. This gives a real Linux environment while staying on a Windows machine — important because some tools behave differently on Windows.

### Install Ubuntu on WSL2 (from PowerShell)

```powershell
wsl --install -d Ubuntu
```

After installation, open Ubuntu and install Node.js via NVM (Node Version Manager). NVM lets you switch Node versions without breaking the system.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Close and reopen the terminal, then:
nvm install 22
```

**Why Node.js 22?** Next.js 16 requires Node 18.18+ and recommends the latest LTS. Node 22 is the current LTS at the time this project was built.

---

## 4. Creating the Next.js project

```bash
cd ~
npx create-next-app@latest wallet-exterior
```

The CLI asks several questions. Here is what was selected and why:

| Question | Choice | Reason |
|---|---|---|
| TypeScript | Yes | Type safety |
| ESLint | Yes | Catches errors before runtime |
| Tailwind CSS | Yes | Utility-first styling |
| `src/` directory | Yes | Keeps app code separate from config files |
| App Router | Yes | Required for server components |
| React Compiler | No | Experimental, adds complexity |
| Customize import alias | No | Default `@/` alias works fine |

The project lives at `~/wallet-exterior`. All paths in this tutorial are relative to that directory.

---

## 5. Database: PostgreSQL via Docker

Rather than installing PostgreSQL directly on the system, we run it in a Docker container. This keeps the database isolated, easy to reset, and reproducible.

```bash
docker run --name wallet-postgres \
  -e POSTGRES_USER=wallet \
  -e POSTGRES_PASSWORD=wallet123 \
  -e POSTGRES_DB=wallet_dev \
  -p 5432:5432 \
  -d postgres:16
```

What each flag means:
- `--name wallet-postgres` — a friendly name so you can refer to it later
- `-e POSTGRES_USER/PASSWORD/DB` — sets up credentials and creates the database automatically
- `-p 5432:5432` — maps the container's port to localhost so the app can connect
- `-d` — runs in detached mode (in the background)

> If you get "permission denied" when running docker commands, add your user to the docker group:
> ```bash
> sudo usermod -aG docker $USER
> ```
> Then close and reopen the terminal.

The connection string goes in `.env`:

```env
DATABASE_URL="postgresql://wallet:wallet123@localhost:5432/wallet_dev"
```

> **Never commit `.env` to Git.** It contains secrets. Confirm it appears in `.gitignore` before making any commits.

---

## 6. ORM: Prisma 7

### Installing dependencies

```bash
npm install prisma @prisma/client @prisma/adapter-pg pg dotenv
npm install -D tsx
```

**Why `@prisma/adapter-pg`?** Prisma 7 introduced a breaking change: the legacy direct database connection via a connection string in the schema is deprecated. You must now use a *driver adapter* — a thin wrapper around the native database driver (`pg` for PostgreSQL). This gives Prisma more control over connection pooling and future driver support.

### Initializing Prisma

```bash
npx prisma init
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

### The schema

`prisma/schema.prisma` defines all the database models. There are three:

```prisma
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

**Why `Decimal` for `quantity` and `price`?** JavaScript's `number` type uses floating-point arithmetic, which produces rounding errors (e.g., `0.1 + 0.2 === 0.30000000000000004`). For financial data, this is not acceptable. PostgreSQL's `DECIMAL`/`NUMERIC` type stores exact values. Prisma maps this to its own `Decimal` type, which you must call `.toNumber()` to convert to a plain JS number.

**Why `cuid()` for IDs instead of auto-increment?** CUIDs are globally unique strings that do not expose sequential IDs, making it harder to enumerate records via the API.

**Why no `onDelete: Cascade` on relations?** This was a deliberate choice to be explicit about what happens when a user is deleted. The admin flow deletes `PortfolioHistory` and `Transaction` records manually before deleting the `User`. This avoids accidental data loss from a misconfigured cascade.

### Prisma config file

Prisma 7 moved the datasource URL from `schema.prisma` into a separate config file:

**`prisma.config.ts`:**
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

**Why a separate config file?** It decouples the database URL from the schema definition, making it easier to swap connection strings per environment (dev, staging, production) without editing the schema.

### Running migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

`migrate dev` creates the SQL migration file and applies it to the database. `prisma generate` generates the typed Prisma Client from the schema.

> **Important Prisma 7 gotcha:** `prisma generate` no longer runs automatically after migrations. You must run it manually any time you change the schema.

### The Prisma singleton

In development, Next.js hot-reloads module code on every file change. Without care, each reload would create a new `PrismaClient` instance, eventually exhausting database connections. The solution is to store the client on `globalThis`, which persists across hot reloads:

**`src/lib/prisma.ts`:**
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

In production, Next.js does not hot-reload, so this guard only applies in development.

### Seeding the admin user

Before the app can be used, an admin account needs to exist. The seed script creates it:

**`prisma/seed.ts`:**
```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@wallet.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@wallet.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

`upsert` means "create if not exists, update otherwise." Using it here means running the seed script multiple times is safe — it will not create duplicate users.

**Why `bcryptjs`?** Passwords must never be stored in plain text. `bcrypt` is a slow hashing algorithm designed specifically for passwords. The `10` is the "cost factor" — it controls how slow the hashing is (higher = slower = harder to brute-force). 10 is a standard default.

```bash
tsx prisma/seed.ts
```

Default admin credentials: `admin@wallet.com` / `admin123`.

---

## 7. Authentication: Auth.js v5

Authentication covers: verifying a user's password, creating a session, persisting that session across requests, and making user data available to server components and API routes.

### Installing

```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs
```

**Why `next-auth@beta`?** The stable `next-auth` (v4) is not compatible with Next.js 14+. The beta is v5, which was rewritten to work with the App Router. Despite the "beta" label, it is the correct version for this project.

### The auth config

**`src/lib/auth.ts`:**
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

        return { id: user.id, email: user.email, name: user.name, role: user.role };
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
  pages: { signIn: "/login" },
});
```

Let's unpack the key parts:

**`session: { strategy: "jwt" }`** — Sessions are stored as a signed JWT in a cookie, not in the database. This avoids needing a `Session` table and scales horizontally (any server can verify the JWT without hitting the database).

**`Credentials` provider** — We verify email + password ourselves using `bcrypt.compare`. Auth.js also supports OAuth (Google, GitHub, etc.) out of the box, but this project only needs email/password login.

**`authorize` callback** — This is where the actual credential check happens. It returns `null` (failed auth) or a user object (success). Auth.js will set a cookie and redirect on success.

**`jwt` and `session` callbacks** — By default, Auth.js only stores the user's name and email in the JWT. We need `id` (to filter database queries by user) and `role` (to restrict admin features). These callbacks inject those fields into the token and then into the session object.

**`pages: { signIn: "/login" }`** — Tells Auth.js to use our custom login page instead of its built-in one.

### Type augmentation

The TypeScript types for `session.user` don't include `id` or `role` by default. We tell TypeScript about our additions:

**`src/types/next-auth.d.ts`:**
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

This file uses TypeScript's *declaration merging* to extend the existing Auth.js types without modifying the library itself.

### The auth route handler

Auth.js needs to handle OAuth callbacks and sign-in/sign-out POST requests via HTTP. We expose this at the standard path:

**`src/app/api/auth/[...nextauth]/route.ts`:**
```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

The `[...nextauth]` is a Next.js *catch-all route* — it matches any path starting with `/api/auth/`, including `/api/auth/session`, `/api/auth/signout`, etc.

### The SessionProvider

Client components that call `useSession()` need a React context provider. We wrap the entire app in one:

**`src/components/providers.tsx`:**
```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

And in the root layout:

**`src/app/layout.tsx`:**
```tsx
import Providers from "@/components/providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Why is `Providers` a separate file?** Because `SessionProvider` must be a client component (`"use client"`). The root layout should stay as a server component. By isolating the provider into its own file, we can mark just that file as a client component and keep the layout on the server.

---

## 8. Route protection: the proxy file

Without protection, any user could navigate directly to `/dashboard` without logging in. We need to intercept every request to `/dashboard/*` and redirect unauthenticated users to `/login`.

In Next.js, this is done with *middleware* — a function that runs before every request. In Next.js 16, the file must be named `proxy.ts` and the function must be named `proxy` (renamed from `middleware.ts`/`middleware`).

> **Critical gotcha: never create `middleware.ts`.** If both `src/middleware.ts` and `src/proxy.ts` exist at the same time, Next.js 16 throws a fatal error and the entire app stops loading. Use `proxy.ts` only.

**`src/proxy.ts`:**
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

**Why `getToken` instead of `auth()`?** Next.js middleware runs in the *Edge Runtime* — a lightweight V8 environment that does not include Node.js built-in modules like `crypto`. Auth.js's `auth()` function internally uses Node.js crypto, which crashes in the Edge Runtime. `getToken` from `next-auth/jwt` uses the Web Crypto API instead, which works everywhere.

**The `config.matcher`** tells Next.js to only run this middleware on the specified paths. Without it, the middleware would run on every request, including static assets and API routes — which would be unnecessary overhead.

**The two redirect rules:**
1. If the user tries to reach `/dashboard/*` without a token → redirect to `/login`.
2. If a logged-in user tries to reach `/login` → redirect to `/dashboard` (they're already authenticated, no need to see the login form).

### Root page redirect

The root `/` page (`src/app/page.tsx`) checks the session server-side and redirects in a single hop:

```ts
export default async function Home() {
  const session = await auth();
  redirect(session ? "/dashboard" : "/login");
}
```

Unauthenticated visitors go straight to `/login`. Authenticated visitors go straight to `/dashboard`. This replaces the default Next.js scaffold page.

---

## 9. Dashboard layout and rendering strategy

### Understanding Server vs Client Components

This project's rendering strategy is: **server components by default, client components only when necessary.**

A **Server Component** runs on the server, has access to the database, filesystem, and environment variables, but cannot use `useState`, `useEffect`, or browser APIs.

A **Client Component** runs in the browser (after being sent from the server), can use React hooks and browser APIs, but cannot directly access the database.

The key insight: the dashboard page fetches data from the database and passes it as props to client components. The client components handle interactivity and charts.

### The dashboard layout

**`src/app/dashboard/layout.tsx`:**
```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Navbar from "@/components/navbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
```

**Why check `session` here if the proxy already guards the routes?** Defense in depth. The proxy runs at the edge and is fast, but it is a best-effort guard. The layout does a proper session check using Auth.js. If someone somehow bypassed the proxy (which shouldn't happen, but in security you assume it might), this redirect is the backstop.

**`max-w-4xl mx-auto`** — constrains the content to a readable width on wide screens while keeping it centered. `px-4` adds horizontal padding on mobile so the content doesn't touch the screen edges.

---

## 10. Average cost (PM) calculation

PM (*preço médio*, or average cost) is the most important calculation in the app. It determines the cost basis of each position, from which P&L is computed.

### The algorithm

The rule for BUY/SELL is asymmetric:

- **BUY:** add the cost. `totalCost += quantity × price`. `totalQty += quantity`. New PM = `totalCost / totalQty`.
- **SELL:** the PM does **not** change. You are simply removing shares at the existing average cost. `totalQty -= quantity`. `totalCost = PM × newQty`.

Why does SELL not change the PM? Because you are not acquiring assets at a new price — you are disposing of existing ones. The average cost of what you still hold is unchanged.

**`src/lib/portfolio.ts`:**
```ts
export function computePositions(transactions: TxInput[]): Position[] {
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  const map = new Map<string, { qty: number; cost: number }>();

  for (const tx of sorted) {
    const pos = map.get(tx.ticker) ?? { qty: 0, cost: 0 };

    if (tx.type === "BUY") {
      pos.cost += tx.quantity * tx.price;
      pos.qty += tx.quantity;
    } else {
      const pm = pos.qty > 0 ? pos.cost / pos.qty : 0;
      pos.qty -= tx.quantity;
      pos.cost = pm * pos.qty;
    }

    map.set(tx.ticker, pos);
  }

  const positions: Position[] = [];
  for (const [ticker, { qty, cost }] of map.entries()) {
    if (qty > 1e-8) {  // ignore floating-point dust
      positions.push({ ticker, quantity: qty, avgCost: cost / qty });
    }
  }

  return positions;
}
```

**Why sort first?** The calculation must be done in chronological order. If a BUY comes after a SELL in the database result, the PM would be wrong.

**Why `1e-8` threshold?** After multiple fractional SELL operations, floating-point arithmetic can leave a quantity like `0.000000000001` instead of exactly `0`. Using `> 1e-8` as the threshold filters out these effectively-zero positions.

**Why compute at runtime instead of storing PM in the database?** Storing a derived value creates consistency problems. If a user edits or deletes an old transaction, the stored PM would be stale. Computing it from the full history on every request guarantees it is always correct.

---

## 11. Live quotes: Finnhub

Users need to see the current value of their positions. This requires live stock prices.

**`src/lib/finnhub.ts`:**
```ts
const FINNHUB_BASE = "https://finnhub.io/api/v1";

type CacheEntry = { price: number; ts: number };
const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000; // 5 minutes

export async function getQuote(symbol: string): Promise<number | null> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) return cached.price;

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price: number = data.c; // "c" = current price in Finnhub's response
    if (!price) return null;
    cache.set(symbol, { price, ts: Date.now() });
    return price;
  } catch {
    return null;
  }
}
```

**Why an in-memory cache?** The Finnhub free tier has rate limits. If 10 users open the dashboard simultaneously and each has 5 tickers, that is 50 API calls at once. With the cache, the first request populates it and subsequent requests within 5 minutes are served from memory — 1 API call instead of 50.

**Why `{ next: { revalidate: 0 } }` in the fetch options?** Next.js aggressively caches `fetch` calls on the server. Setting `revalidate: 0` tells Next.js to always make a real network request (we handle our own TTL manually).

**The quotes API route** — `src/app/api/quotes/route.ts` — is a server-side proxy. The browser never touches the Finnhub API directly, so the API key stays secret. The client calls `/api/quotes?tickers=AAPL,MSFT` and gets back a JSON object of prices.

### Client-side polling

The `PortfolioClient` component polls for fresh quotes every 5 minutes:

```ts
useEffect(() => {
  if (positions.length === 0) return;
  const tickers = positions.map((p) => p.ticker).join(",");

  async function poll() {
    const res = await fetch(`/api/quotes?tickers=${tickers}`);
    if (res.ok) setQuotes(await res.json());
  }

  poll(); // immediate fetch on mount
  const id = setInterval(poll, 5 * 60 * 1000);
  return () => clearInterval(id); // cleanup on unmount
}, [positions]);
```

The interval is cleaned up when the component unmounts (navigating away). Without the cleanup, the interval would keep running in the background and accumulate with every re-mount.

---

## 12. Portfolio history: lazy daily snapshots

To show a "Portfolio value over time" line chart, we need historical data. We could use a cron job or an external service to snapshot the value daily. Instead, we use a simpler approach: **lazy snapshotting**.

Every time the dashboard page is loaded, it checks whether a `PortfolioHistory` record for today already exists. If not, it creates one.

From `src/app/dashboard/page.tsx`:
```ts
if (positions.length > 0) {
  const totalValue = positions.reduce(
    (sum, p) => sum + p.quantity * (quotes[p.ticker] ?? 0),
    0
  );
  if (totalValue > 0) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const existing = await prisma.portfolioHistory.findFirst({
      where: { userId, snapshotAt: { gte: todayStart } },
    });

    if (!existing) {
      await prisma.portfolioHistory.create({ data: { userId, totalValue } });
    }
  }
}
```

**Why use UTC midnight?** Using `setUTCHours(0, 0, 0, 0)` makes the "today" boundary consistent regardless of the server's timezone. Without this, a server in a different timezone might create two snapshots in a calendar day.

**Trade-offs of this approach:**
- ✅ No cron job, no background worker, no extra infrastructure
- ✅ The snapshot is always taken at the real market price at the time of the visit
- ⚠️ If a user doesn't open the app on a given day, there is no snapshot for that day (the chart will have gaps)
- ⚠️ The snapshot captures the price at the time of the visit, not at market close

For this project, these trade-offs are acceptable. Investors who want daily precision can open the app each day.

---

## 13. Charts with Recharts and the SSR trap

Recharts is a browser-first library. It uses `ResizeObserver` and other Web APIs that do not exist in a Node.js environment. When Next.js renders a server component (or the initial HTML for a client component during SSR), Recharts tries to access these APIs and crashes.

**The fix: the `mounted` flag.**

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

// Only render charts after the component has mounted in the browser
{mounted && pieData.length > 0 && (
  <PieChart .../>
)}
```

`useEffect` only runs in the browser, never during SSR. So `mounted` is `false` during the initial render (on the server) and becomes `true` only after hydration in the browser. Gating the chart render on `mounted` means the chart is never attempted server-side.

**Why not use dynamic imports with `ssr: false`?** `next/dynamic` with `{ ssr: false }` is another valid approach but requires wrapping each chart in a dynamic import and creates more boilerplate. The `mounted` flag is simpler and works for any browser-only content.

---

## 14. Adding transactions

### The transaction modal

The "Add Transaction" button and form live in `src/components/transaction-modal.tsx`. It is a client component (`"use client"`) because it manages local state (open/closed, form values, loading state).

**Modal close behavior:** modals only close via their explicit Cancel/Close buttons. Clicking the dark backdrop behind the modal does nothing. This is intentional — accidental clicks outside the modal should not discard in-progress form input.

The form submits to `POST /api/transactions`:

**`src/app/api/transactions/route.ts` (POST handler):**
```ts
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  // ... validate fields ...

  await prisma.transaction.create({
    data: {
      userId: session.user.id, // always from session, never from request body
      ticker: body.ticker.toUpperCase().trim(),
      type: body.type,
      quantity: body.quantity,
      price: body.price,
      date: new Date(body.date),
    },
  });
}
```

**Critical security rule:** `userId` is always taken from the server-side session, never from the request body. If the client sent `userId` in the body, a malicious user could forge requests and create transactions for other users. The server knows who is authenticated — trust that, not the client.

The `GET /api/transactions` handler similarly filters by `session.user.id`:
```ts
const transactions = await prisma.transaction.findMany({
  where: { userId: session.user.id },
  orderBy: { date: "desc" },
});
```

---

## 15. The Brokerage field

### Why add it?

Investors often use multiple brokerages (Avenue, TD Ameritrade, Interactive Brokers, etc.). Tracking which brokerage a transaction came from makes it easier to reconcile records and understand fees.

### Schema change

```prisma
model Transaction {
  ...
  brokerage String?   // nullable — existing records are not affected
  ...
}
```

`String?` (nullable) is the right choice here because:
- Existing transactions in the database do not have a brokerage — making it required would break all existing records.
- Users who don't care about tracking brokerage should not be forced to fill it in.

After editing the schema, run:
```bash
npx prisma migrate dev --name add-brokerage-to-transaction
npx prisma generate
```

### Form field

The "Add Transaction" modal includes an optional Brokerage text input below the Date field. The `colorScheme: "dark"` style on the date input forces the browser's native date picker to render in dark mode — without it, the calendar icon appears white on a dark background on some browsers.

### API

`POST /api/transactions` reads `brokerage` from the request body and saves it after trimming whitespace. If the field is empty or missing, `null` is stored — not an empty string. This keeps the data clean and makes "no brokerage" distinguishable from an empty string.

```ts
brokerage: brokerage ? String(brokerage).trim() : null,
```

### Transactions list

The `/dashboard/transactions` page shows a **Brokerage** column at the right of the table. Rows without a brokerage display `—` in muted grey (`text-zinc-700`) to visually distinguish "not set" from an actual value.

### Import

The CSV file's `BROKERAGE` column is **ignored** — `brokerage` is always set to `null` on import. The reasoning: the brokerage column in brokerage exports represents a fee amount, not the institution name. Users who want to record the institution name should use the manual form.

---

## 16. CSV and Excel import

Manually entering dozens of historical transactions is tedious. The import feature lets users upload a CSV or Excel file and bulk-import transactions.

### Why a two-step flow?

A single "upload and save" button would be risky: if the file has formatting errors, some rows would be inserted and others rejected, leaving the portfolio in an inconsistent state. The two-step approach separates validation from insertion:

1. **Preview** — parse the file, validate every row, show a summary (valid rows, rejected rows with reasons, conflicts with existing data). Nothing is saved yet.
2. **Confirm** — the user reviews the preview and clicks Confirm. Only the valid rows are inserted.

### Expected file format

The CSV file uses **semicolons as the delimiter** (not commas). This avoids conflicts with numeric values that use commas as thousands separators (e.g., `2,670.95`).

```
DATA;Type;Ticker;Quantity;Price (USD);PRINCIPAL;BROKERAGE
2022-03-09;buy;AAPL;10;165.32;1653.20;1.50
2023-01-15;buy;VNQ;5;87.74;438.70;1.50
2023-02-02;sale;MELI;1;1235.01;1235.01;1.50
```

| Column | Format | Notes |
|---|---|---|
| `DATA` | `YYYY-MM-DD` | Any valid date string accepted by `new Date()` |
| `Type` | `buy` or `sale` (any case) | `buy` → `BUY`, `sale` → `SELL` |
| `Ticker` | Ticker symbol (e.g., `AAPL`) | Normalized to uppercase |
| `Quantity` | Dot as decimal separator (`10`, `1.71`) | Parsed directly with `parseFloat` |
| `Price (USD)` | Dot as decimal, comma as thousands (`2,670.95`) | Commas stripped before `parseFloat` |
| `PRINCIPAL` | Any | **Ignored** — not saved |
| `BROKERAGE` | Any | **Ignored** — not saved |

### The parsing functions

Rather than one monolithic parse function, each concern is isolated:

```ts
// Accepts any date string parseable by new Date() — e.g. "2022-03-09"
function parseDate(raw: string): string | null {
  const parsed = new Date(String(raw).trim());
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// "buy" → "BUY", "sale" → "SELL". Case-insensitive.
function normalizeOperation(raw: string): "BUY" | "SELL" | null {
  const upper = String(raw).toUpperCase().trim();
  if (upper === "BUY") return "BUY";
  if (upper === "SELL" || upper === "SALE") return "SELL";
  return null;
}

// Removes comma thousands separators: "2,670.95" → 2670.95
function parsePrice(raw: string): number {
  return parseFloat(String(raw).trim().replace(/,/g, ""));
}

// Standard dot decimal, no transformation needed
function parseQuantity(raw: string): number {
  return parseFloat(String(raw).trim());
}
```

**Why accept `sale` in addition to `SELL`?** The brokerage export uses `buy`/`sale` (lowercase, and "sale" instead of "sell"). The normalizer maps both spellings to the canonical `BUY`/`SELL` enum values stored in the database.

**Why use `new Date()` directly instead of a regex?** The brokerage file uses `YYYY-MM-DD`, which JavaScript's `Date` constructor parses reliably across all environments. A regex would add complexity without benefit for this well-formed format.

### The preview endpoint

**`POST /api/import/preview`**

```ts
if (filename.endsWith(".csv")) {
  const text = await file.text();
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ";" });
  records = result.data;
} else if (filename.endsWith(".xlsx")) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  records = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}
```

**Why `delimiter: ";"` in papaparse?** Without it, papaparse auto-detects the delimiter and may choose comma — which would treat `2,670.95` as two fields instead of one number. Explicitly setting semicolon ensures consistent parsing.

**Why return `existingTickers` separately instead of blocking?** Importing into a ticker you already have transactions for is not necessarily wrong — you might be adding older history. The import warns the user but does not prevent it.

### The confirm endpoint

**`POST /api/import/confirm`**

```ts
await prisma.transaction.createMany({
  data: rows.map((r) => ({
    userId: session.user.id,
    ticker: r.ticker,
    type: r.type,
    quantity: r.quantity,
    price: r.price,
    date: new Date(r.date),
    brokerage: r.brokerage ?? null,
  })),
});
```

`createMany` inserts all rows in a single database query, which is much faster than inserting one row at a time. `brokerage` is always `null` from the import — the `BROKERAGE` column in the file is ignored.

### Sample file download

The import page includes a "Download sample file" button. It generates a valid CSV string client-side and triggers a browser download via a Blob URL — no server round-trip needed:

```ts
function downloadSample() {
  const csv = [
    "DATA;Type;Ticker;Quantity;Price (USD);PRINCIPAL;BROKERAGE",
    "2022-03-09;buy;AAPL;10;165.32;1653.20;1.50",
    "2023-01-15;buy;VNQ;5;87.74;438.70;1.50",
    "2023-02-02;sale;MELI;1;1235.01;1235.01;1.50",
  ].join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "sample-import.csv";
  a.click();
  URL.revokeObjectURL(url); // free memory immediately after click
}
```

**Why `URL.revokeObjectURL` immediately?** Blob URLs hold a reference to memory until either the page unloads or you explicitly revoke them. Revoking right after `click()` is safe because the browser queues the download before the URL is released.

---

## 17. Admin: user management

The admin area (`/dashboard/admin`) is only accessible to users with `role === "ADMIN"`. Authorization is enforced in two places:

### 1. The page itself

**`src/app/dashboard/admin/page.tsx`:**
```ts
const session = await auth();
if (!session) redirect("/login");
if (session.user.role !== "ADMIN") redirect("/dashboard");
```

A non-admin user who navigates to `/dashboard/admin` is silently redirected to their own dashboard. They see nothing that reveals the admin page exists.

### 2. Every API route

**`src/app/api/users/route.ts`:**
```ts
if (session.user.role !== "ADMIN")
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

**Why check in both places?** The page redirect is a UX guard — it prevents the browser from showing an error page. The API check is the real security boundary — it prevents a determined user from calling the API directly (e.g., via `curl`) even if they somehow know the endpoint exists.

### Admin features

- **Create user** — POST `/api/users` with name, email, password, role. Password is hashed with bcrypt before storage.
- **Reset password** — PATCH `/api/users/[id]` with a new password. The admin does not need to know the current password.
- **Delete user** — DELETE `/api/users/[id]`. Because there is no cascade in the schema, the API manually deletes `PortfolioHistory` and `Transaction` records before deleting the `User`.

The `AdminClient` component (`src/components/admin-client.tsx`) handles the user table and the modals (create, reset password, delete confirmation). It is a client component because it manages local state for which modal is open, form values, and optimistic UI updates (removing a deleted user from the table without a full page reload).

---

## 18. End-to-end tests with Playwright

End-to-end tests simulate real user interactions in a browser. They are the most realistic form of testing — they catch bugs that unit tests miss (navigation flows, form submissions, server interactions).

### Important: run Playwright from Windows

Playwright does not yet support Ubuntu 26.04. All Playwright commands must be run from **Windows PowerShell**, not WSL, using the WSL filesystem path:

```powershell
# Navigate to the project via the WSL filesystem
cd \\wsl$\Ubuntu\home\alexa\wallet-exterior

npm install
npx playwright install chromium
```

Keep the dev server running in WSL:
```bash
# WSL terminal
npm run dev
```

Run tests from PowerShell:
```powershell
npx playwright test
npx playwright test --ui          # interactive UI mode
npx playwright show-report        # HTML report
```

### Auth strategy: reusing sessions

If each test logged in via the UI, the test suite would be slow and fragile. Instead, we use Playwright's *storage state* feature:

1. The `setup` project (`tests/auth.setup.ts`) runs once before all tests. It logs in as admin and as a regular user and saves the browser session to files (`playwright/.auth/admin.json`, `playwright/.auth/user.json`).
2. Each test project loads one of these saved sessions via `storageState` in `playwright.config.ts`.

This means tests start already logged in — no login UI interaction needed.

### Test files

| File | Auth context | What it covers |
|---|---|---|
| `tests/auth.setup.ts` | None | Runs the login flow and saves session files |
| `tests/auth.spec.ts` | None | Redirect to login, invalid credentials, sign out |
| `tests/transactions.spec.ts` | Regular user | Transactions list page, open modal, add a BUY |
| `tests/import.spec.ts` | Regular user | Upload `fixtures/sample.csv`, preview, confirm |
| `tests/admin.spec.ts` | Admin | User list, create/reset/delete a user, redirect for non-admins |

### DB note

Tests run against the development database. The admin test suite creates a user (`e2e-admin-test@wallet.com`) and deletes it at the end. If a test run is interrupted before cleanup, delete that user manually via the Admin page before the next run, or use `npx prisma studio` to delete it.

---

## 19. Known gotchas reference

Collected from real problems encountered while building this project:

| Problem | Root cause | Solution |
|---|---|---|
| `url` deprecated in `schema.prisma` | Prisma 7 moved the URL to the config file | Use `prisma.config.ts` with `env("DATABASE_URL")` |
| `PrismaClient` fails to connect | Prisma 7 requires a driver adapter | Instantiate with `new PrismaPg({ connectionString })` and pass to `new PrismaClient({ adapter })` |
| `next-auth@stable` (v4) incompatible | v4 does not support the App Router | Install `next-auth@beta` (v5) |
| Middleware crashes with crypto error | Edge Runtime lacks Node.js `crypto` | Use `getToken` from `next-auth/jwt` (uses Web Crypto API) |
| `middleware.ts` not picked up | Next.js 16 renamed the file | Use `proxy.ts` with `export async function proxy` |
| App stops loading entirely | Both `middleware.ts` and `proxy.ts` exist simultaneously | Delete `middleware.ts` — only `proxy.ts` must exist |
| `prisma generate` not run after migration | Prisma 7 removed auto-generate | Run `npx prisma generate` manually after schema changes |
| Recharts crashes on server | Recharts uses browser-only APIs | Gate chart renders on `mounted` state (set in `useEffect`) |
| Playwright tests fail on Ubuntu 26.04 | Ubuntu 26.04 not yet supported | Run `npx playwright test` from Windows PowerShell |
| Multiple Prisma Client instances in dev | Next.js hot reload creates new module instances | Store client on `globalThis` in development |
| Decimal rounding errors in positions | JavaScript `number` uses floating-point | Use Prisma's `Decimal` type; call `.toNumber()` only for display |
