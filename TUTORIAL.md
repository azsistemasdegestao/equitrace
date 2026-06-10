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
10. [Average cost calculation](#10-average-cost-calculation)
11. [Live quotes: Finnhub](#11-live-quotes-finnhub)
12. [Portfolio history: lazy daily snapshots](#12-portfolio-history-lazy-daily-snapshots)
13. [Charts with Recharts and the SSR trap](#13-charts-with-recharts-and-the-ssr-trap)
14. [Adding transactions](#14-adding-transactions)
15. [The Brokerage field](#15-the-brokerage-field)
16. [CSV and Excel import](#16-csv-and-excel-import)
17. [Admin: user management](#17-admin-user-management)
18. [End-to-end tests with Playwright](#18-end-to-end-tests-with-playwright)
19. [Editing and deleting transactions](#19-editing-and-deleting-transactions)
20. [UX polish: skeletons, empty states, mobile](#20-ux-polish-skeletons-empty-states-mobile)
21. [Ticker search: autocomplete dropdown in the modal](#21-ticker-search-autocomplete-dropdown-in-the-modal)
22. [Auto-refresh after mutations](#22-auto-refresh-after-mutations)
23. [Change password modal](#23-change-password-modal)
24. [Known gotchas reference](#24-known-gotchas-reference)

---

## 1. What are we building?

**Equitrace** is a mobile-first web application for investors who buy US stocks (NYSE/NASDAQ) and want to track their portfolio over time.

The core problem it solves: investors who buy US assets need to track transactions in dollars, compute their average cost, and see the current value of each position. Most brokerage apps don't expose this in a clean way, especially for investors who use multiple brokerages.

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

## 10. Average cost calculation

The average cost (shown as **Avg Cost** in the UI) is the most important calculation in the app. It determines the cost basis of each position, from which P&L is computed.

### The algorithm

The rule for BUY/SELL is asymmetric:

- **BUY:** add the cost. `totalCost += quantity × price`. `totalQty += quantity`. New avg cost = `totalCost / totalQty`.
- **SELL:** the average cost does **not** change. You are simply removing shares at the existing average cost. `totalQty -= quantity`. `totalCost = avgCost × newQty`.

Why does SELL not change the average cost? Because you are not acquiring assets at a new price — you are disposing of existing ones. The average cost of what you still hold is unchanged.

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

**Why sort first?** The calculation must be done in chronological order. If a BUY comes after a SELL in the database result, the average cost would be wrong.

**Why `1e-8` threshold?** After multiple fractional SELL operations, floating-point arithmetic can leave a quantity like `0.000000000001` instead of exactly `0`. Using `> 1e-8` as the threshold filters out these effectively-zero positions.

**Why compute at runtime instead of storing the average cost in the database?** Storing a derived value creates consistency problems. If a user edits or deletes an old transaction, the stored value would be stale. Computing it from the full history on every request guarantees it is always correct.

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

### Client-side polling — and why quotes are NOT fetched server-side

The `PortfolioClient` component fetches quotes immediately on mount and then polls every 5 minutes. A `quotesLoading` flag (initially `true` when there are positions) drives skeleton placeholders until the first response arrives:

```ts
const [quotesLoading, setQuotesLoading] = useState(positions.length > 0);

useEffect(() => {
  if (positions.length === 0) return;
  const tickers = positions.map((p) => p.ticker).join(",");

  async function poll() {
    const res = await fetch(`/api/quotes?tickers=${tickers}`);
    if (!res.ok) return;
    const data = await res.json();
    setQuotes(data);
    setQuotesLoading(false); // removes skeletons on first success
  }

  poll(); // immediate fetch on mount
  const id = setInterval(poll, 5 * 60 * 1000);
  return () => clearInterval(id); // cleanup on unmount
}, [positions]);
```

The interval is cleaned up when the component unmounts (navigating away). Without the cleanup, the interval would keep running in the background and accumulate with every re-mount.

**Why not fetch quotes in the server component (dashboard/page.tsx) and pass them as `initialQuotes`?**

It seems natural to pre-load quotes on the server so the page renders with data already visible. In practice, this is a bad idea:

- Finnhub API calls take 500ms–3s each over the network.
- With many tickers (e.g., 29), the server waits for all of them in parallel before sending any HTML to the browser.
- The user stares at a blank page for several seconds instead of seeing the portfolio instantly.

The better pattern: pass `initialQuotes: {}` from the server and let the client fetch quotes right after mount. The page loads instantly. Quotes appear 1–2 seconds later. This is a much better perceived performance.

```ts
// dashboard/page.tsx — DO NOT call getQuotes() here
return (
  <PortfolioClient
    positions={positions}
    initialQuotes={{}}   // client fetches on mount
    history={historyData}
  />
);
```

The same reasoning applies to the transactions list: quotes are fetched by `TransactionsClient` on mount, not by the server component.

---

## 12. Portfolio history: lazy daily snapshots

To show a "Portfolio value over time" line chart, we need historical data. We could use a cron job or an external service to snapshot the value daily. Instead, we use a simpler approach: **lazy snapshotting**.

Once per day (per session), after the client loads live quotes and computes the total portfolio value, it fires a POST to `/api/snapshot`. That endpoint checks whether a `PortfolioHistory` record for today already exists and creates one if not.

### Why the snapshot moved to the client

Originally, the snapshot was created server-side in `dashboard/page.tsx` — it fetched quotes via Finnhub, computed `totalValue`, and saved the record before returning HTML. This worked but caused the page to block on Finnhub (see chapter 11). Moving the snapshot to the client decouples page load speed from the snapshot creation.

### The snapshot endpoint

**`src/app/api/snapshot/route.ts`:**
```ts
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { totalValue } = await request.json();
  if (typeof totalValue !== "number" || totalValue <= 0) {
    return new NextResponse(null, { status: 204 });
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.portfolioHistory.findFirst({
    where: { userId: session.user.id, snapshotAt: { gte: todayStart } },
  });

  if (!existing) {
    await prisma.portfolioHistory.create({
      data: { userId: session.user.id, totalValue },
    });
  }

  return new NextResponse(null, { status: 204 });
}
```

### How the client triggers it

In `PortfolioClient`, after the first successful quote fetch, the total value is computed and sent to `/api/snapshot`. A `snapshotSaved` flag prevents duplicate calls on subsequent polls:

```ts
let snapshotSaved = false;

async function poll() {
  const res = await fetch(`/api/quotes?tickers=${tickers}`);
  if (!res.ok) return;
  const data = await res.json();
  setQuotes(data);
  setQuotesLoading(false);

  if (!snapshotSaved) {
    const totalValue = positions.reduce(
      (sum, p) => sum + p.quantity * (data[p.ticker] ?? 0),
      0
    );
    if (totalValue > 0) {
      snapshotSaved = true;
      fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalValue }),
      }).catch(() => {}); // fire and forget
    }
  }
}
```

**Why `snapshotSaved` and not just checking the date each time?** The flag avoids sending a network request on every poll tick (every 5 minutes). Once the snapshot is saved for the session, there is nothing more to do until the next day.

**Why `.catch(() => {})` on the snapshot fetch?** The snapshot is non-critical. If the request fails (network hiccup, server restart), the page should not break. The history chart will simply not have today's point — which is acceptable.

**Why use UTC midnight?** Using `setUTCHours(0, 0, 0, 0)` makes the "today" boundary consistent regardless of the server's timezone. Without this, a server in a different timezone might create two snapshots in a calendar day.

**Trade-offs of this approach:**
- ✅ No cron job, no background worker, no extra infrastructure
- ✅ Page loads instantly — snapshot happens in the background
- ✅ The snapshot captures the real market price at the time of the visit
- ⚠️ If a user doesn't open the app on a given day, there is no snapshot for that day (the chart will have gaps)
- ⚠️ The snapshot captures the price at the time of the visit, not at market close

For this project, these trade-offs are acceptable.

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

### Quote lookup in the modal

When registering a transaction, the user needs to know the current market price. Typing a ticker and switching to a browser tab to look it up is friction. The modal removes that friction with an inline quote lookup.

When the Ticker field loses focus (`onBlur`), the modal calls `/api/quotes?tickers=X` and shows a hint next to the Price label:

```
Price (USD)    current: $213.49  [use]
```

Clicking **use** fills the Price field with the live quote. The hint is cleared when the ticker changes or the modal is reopened.

```ts
async function handleTickerBlur() {
  if (!form.ticker) return;
  setQuoteLoading(true);
  try {
    const res = await fetch(`/api/quotes?tickers=${form.ticker}`);
    if (res.ok) {
      const data = await res.json();
      if (data[form.ticker]) setCurrentQuote(data[form.ticker]);
    }
  } catch {}
  finally { setQuoteLoading(false); }
}
```

**Why `onBlur` instead of `onChange`?** Fetching on every keystroke would hammer the API with partial tickers like `A`, `AP`, `APP`, `APPL`, `AAPL`. `onBlur` triggers once when the user finishes typing and tabs to the next field — exactly the right moment.

**Why not cache the result?** The modal's quote is only used once (to fill the Price field). The Finnhub server-side cache handles deduplication across users. No client-side caching needed here.

### Transactions list with live quotes

The transactions list (`/dashboard/transactions`) is split into two layers:

- **Server component** (`transactions/page.tsx`) — fetches rows from the database and passes them as props. Fast, no external calls.
- **Client component** (`TransactionsClient`) — receives the rows, fetches live quotes on mount, and renders the full table.

The table has two columns beyond the basic transaction data:

| Column | Formula | Shown for |
|---|---|---|
| **Current Value** | `quantity × current price` | All rows |
| **P&L** | `current value − paid total` | BUY rows only |

**Why P&L only for BUY?** For a SELL, the "value" of those shares today has no clear meaning — you no longer hold them. Showing a P&L for a SELL would be confusing (it could be interpreted as "opportunity cost" but that is not what users expect). Keeping it to BUY rows gives a clear, actionable signal: "this purchase is up $X or down $Y."

Quotes are polled every 5 minutes, same as the portfolio page.

---

## 15. The Brokerage field (schema only)

The `Transaction` model has a `brokerage String?` column added during development. It is **nullable and has no UI** — the Add/Edit modal does not expose it, and it is never shown in the transactions table. All new transactions and imports store `null`.

The column was retained in the schema to avoid a migration for existing data and in case it becomes useful in the future (e.g., tracking fees or institution per transaction).

```prisma
model Transaction {
  ...
  brokerage String?   // nullable, unused in UI
  ...
}
```

> The `colorScheme: "dark"` style on the date input forces the browser's native date picker to render in dark mode — without it, the calendar icon appears white on a dark background on some browsers.

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
Date;Type;Ticker;Quantity;Price (USD)
2022-03-09;buy;AAPL;10;165.32
2023-01-15;buy;VNQ;5;87.74
2023-02-02;sell;MSFT;1;310.50
```

| Column | Format | Notes |
|---|---|---|
| `Date` | `YYYY-MM-DD` | Any valid date string accepted by `new Date()` |
| `Type` | `buy` or `sell` (any case) | `buy` → `BUY`, `sell` → `SELL` |
| `Ticker` | Ticker symbol (e.g., `AAPL`) | Normalized to uppercase |
| `Quantity` | Dot as decimal separator (`10`, `1.71`) | Parsed directly with `parseFloat` |
| `Price (USD)` | Dot as decimal, comma as thousands (`2,670.95`) | Commas stripped before `parseFloat` |
| Any other column | Any | **Ignored** — not saved |

### The parsing functions

Rather than one monolithic parse function, each concern is isolated:

```ts
// Accepts any date string parseable by new Date() — e.g. "2022-03-09"
function parseDate(raw: string): string | null {
  const parsed = new Date(String(raw).trim());
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// "buy" → "BUY", "sell" → "SELL". Case-insensitive.
function normalizeOperation(raw: string): "BUY" | "SELL" | null {
  const upper = String(raw).toUpperCase().trim();
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
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

**Why accept `buy`/`sell` in lowercase?** Exported files often use lowercase. The normalizer uppercases before comparing, mapping both `buy` and `BUY` to the canonical `BUY` enum value.

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

`createMany` inserts all rows in a single database query, which is much faster than inserting one row at a time.

### Sample file download

The import page includes a "Download sample file" button. It generates a valid CSV string client-side and triggers a browser download via a Blob URL — no server round-trip needed:

```ts
function downloadSample() {
  const csv = [
    "Date;Type;Ticker;Quantity;Price (USD)",
    "2022-03-09;buy;AAPL;10;165.32",
    "2023-01-15;buy;VNQ;5;87.74",
    "2023-02-02;sell;MSFT;1;310.50",
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

## 19. Editing and deleting transactions

Transactions can be edited (to correct mistakes) or deleted. Both actions require verifying ownership — a user must not be able to modify another user's data.

### The API endpoints

**`src/app/api/transactions/[id]/route.ts`** exposes PATCH and DELETE:

```ts
async function ownsTransaction(userId: string, id: string) {
  const t = await prisma.transaction.findUnique({ where: { id } });
  return t?.userId === userId ? t : null;
}

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await ownsTransaction(session.user.id, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ... validate body ...

  const updated = await prisma.transaction.update({
    where: { id: params.id },
    data: { ticker, type, quantity, price, date },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request, { params }) {
  const session = await auth();
  // ...ownership check...
  await prisma.transaction.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
```

**Why `ownsTransaction` instead of just using the ID directly?** A user could call `DELETE /api/transactions/<other-user-id>` if they know or guess another user's transaction ID. The ownership check fetches the record first and verifies `userId` matches the session. If not, the API returns `404` (not `403`) — this avoids confirming that the ID exists.

**Why `404` and not `403` for unauthorized access?** Returning `403 Forbidden` reveals that the resource exists. `404 Not Found` is safer — the user sees the same response whether the ID doesn't exist or doesn't belong to them.

### The UI

In `TransactionsClient`, each row has two icon buttons in an **Actions** column at the far right:

- **Pencil icon** → opens an Edit modal pre-filled with the row's current values
- **Trash icon** → opens a Delete confirmation modal

**Edit modal:** identical fields to the Add Transaction modal (ticker, type, quantity, price, date), including the quote lookup (`onBlur` on ticker). The form submits to `PATCH /api/transactions/[id]`. On success, the row is updated in local state immediately — no page reload needed.

**Delete modal:** shows "Delete transaction? This action cannot be undone." with a red Delete button. On confirm, it calls `DELETE /api/transactions/[id]` and removes the row from local state.

### Optimistic UI

Both edit and delete update `rows` state in React immediately after the API responds successfully, before `router.refresh()` runs. This means the user sees the change instantly — the table does not flash or reload. The `router.refresh()` call syncs the server component cache in the background.

```ts
// Edit: update the row in local state
setRows((prev) =>
  prev.map((r) => r.id === editRow.id ? { ...r, ...updatedFields } : r)
);

// Delete: remove the row from local state
setRows((prev) => prev.filter((r) => r.id !== deleteId));
```

---

## 20. UX polish: skeletons, empty states, mobile

### Loading skeletons

Quotes load asynchronously after mount. Without feedback, the user sees `—` in every cell for several seconds with no indication that data is coming. A `quotesLoading` boolean drives animated skeleton placeholders until the first quote response arrives.

```tsx
function Skeleton({ wide = false }: { wide?: boolean }) {
  return (
    <span className={`h-4 ${wide ? "w-20" : "w-14"} bg-zinc-800 rounded animate-pulse inline-block`} />
  );
}

// In the cell:
{quotesLoading ? <Skeleton /> : value > 0 ? usd(value) : "—"}
```

**Why `<span>` and not `<div>`?** Skeleton elements sit inside table cells and card paragraphs (`<p>`). HTML does not allow block elements (`<div>`) inside inline/text containers (`<p>`). Using `<span` with `inline-block` display achieves the same visual result without the invalid nesting that triggers React hydration errors.

The `quotesLoading` state initializes as `true` only when there are positions (`positions.length > 0`). It becomes `false` on the first successful quote fetch. Subsequent polls update quotes silently — no skeleton is shown again.

### Empty states with CTAs

When a user has no transactions yet, showing only "No data" is unhelpful. The empty states in both the Portfolio and Transactions pages include actionable buttons:

```tsx
<div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
  <p className="text-white font-semibold mb-1">No positions yet</p>
  <p className="text-zinc-400 text-sm mb-6">
    Add transactions manually or import a CSV file.
  </p>
  <div className="flex flex-col sm:flex-row gap-3 justify-center">
    <Link href="/dashboard/transactions" className="bg-white text-black ...">
      + Add Transaction
    </Link>
    <Link href="/dashboard/import" className="border border-zinc-700 ...">
      Import CSV / Excel
    </Link>
  </div>
</div>
```

### Mobile-responsive tables

Both the portfolio positions table and the transactions table have too many columns to display comfortably on a phone. Tailwind's responsive prefix `hidden sm:table-cell` hides lower-priority columns on small screens:

| Table | Hidden on mobile | Visible on all screens |
|---|---|---|
| Portfolio | Quantity, Current Price | Ticker, Avg Cost, Value, P&L |
| Transactions | Qty, Price | Date, Ticker, Type, Paid, Current, P&L, Actions |

`sm:table-cell` restores the column at the `sm` breakpoint (640px+). The approach requires setting both the `<th>` and every `<td>` in that column to `hidden sm:table-cell`.

---

## 21. Ticker search: autocomplete dropdown in the modal

When a user opens the "New Transaction" modal and starts typing a ticker, they might mistype a symbol (`APPL` instead of `AAPL`) and not realize it until they save. The ticker search feature prevents this by showing a live dropdown of matching companies as they type.

This chapter explains how that dropdown was built — from the backend API to every React concept involved.

---

### What the feature does

1. The user types one or more characters in the **Ticker** field.
2. After a short pause, the app calls `/api/search?q=AAPL`.
3. Finnhub returns a list of matching companies.
4. A dropdown appears below the input, showing the stock symbol and company name.
5. The user clicks a result — the Ticker field is filled and the current price is fetched automatically.

---

### Step 1 — The backend: `/api/search/route.ts`

We need a server-side route that proxies the Finnhub symbol search API. The API key lives on the server and must never be sent to the browser.

```ts
// src/app/api/search/route.ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json([]);

  const apiKey = process.env.FINNHUB_API_KEY;
  const res = await fetch(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`
  );
  if (!res.ok) return NextResponse.json([]);

  const data = await res.json();

  const results = (data.result ?? [])
    .filter((r) => r.type === "Common Stock" && !r.symbol.includes("."))
    .slice(0, 7)
    .map((r) => ({ symbol: r.displaySymbol, name: r.description }));

  return NextResponse.json(results);
}
```

**Key decisions:**

- **`r.type === "Common Stock"`** — Finnhub returns many result types (ETFs, indices, bonds). We only want stocks.
- **`!r.symbol.includes(".")`** — US exchange symbols have no dots. `AAPL` is Apple on NASDAQ. `AAPL.BA` is Apple on the Buenos Aires exchange. We only want US-listed symbols.
- **`.slice(0, 7)`** — caps the results at 7. Longer dropdowns are harder to scan.
- **`.map((r) => ({ symbol, name }))`** — the Finnhub response has many fields. We only expose what the UI needs, keeping the payload small.

---

### Step 2 — Debouncing: don't call the API on every keystroke

If we called `/api/search` every time the user pressed a key, a word like `AAPL` would fire four requests: `A`, `AA`, `AAP`, `AAPL`. Three of those are wasted.

**Debouncing** means: wait for the user to stop typing before firing the request. Specifically, we wait 350ms after the last keystroke. If another keystroke arrives before the 350ms timer expires, we reset the timer.

In React, this is done with `useRef` holding a timeout ID:

```tsx
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

function handleChange(e) {
  const upper = e.target.value.toUpperCase();
  setForm((prev) => ({ ...prev, ticker: upper }));

  if (debounceRef.current) clearTimeout(debounceRef.current); // cancel previous timer

  if (upper.length >= 1) {
    debounceRef.current = setTimeout(() => runSearch(upper), 350); // start new timer
  } else {
    setSearchResults([]);
    setSearchOpen(false);
  }
}
```

**Why `useRef` and not `useState` for the timer?**

`useState` triggers a re-render when its value changes. Storing a timer ID in state would cause the component to re-render every time a timer is created or cancelled — which is once per keystroke. That is both unnecessary and expensive.

`useRef` stores a value that persists across renders without causing any re-render when it changes. It is the right tool for "I need to remember this between renders, but I don't need the UI to update when it changes."

---

### Step 3 — Running the search

The search function calls our API route and updates state with the results:

```tsx
async function runSearch(q: string) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data: SearchResult[] = await res.json();
    setSearchResults(data);
    setSearchOpen(data.length > 0);
  } catch {}
}
```

`setSearchOpen(data.length > 0)` opens the dropdown only if there are results. If the query matches nothing, no empty dropdown appears.

---

### Step 4 — The dropdown: positioning with CSS

The dropdown must appear directly below the input, overlapping the rest of the form. In HTML, an element can be "pulled out" of the normal document flow and positioned relative to an ancestor using `position: absolute` and `position: relative`.

```tsx
<div ref={tickerWrapRef} className="relative">  {/* the anchor */}
  <input ... />

  {searchOpen && (
    <ul className="absolute z-10 top-full mt-1 w-full ...">
      {/* results */}
    </ul>
  )}
</div>
```

- **`relative` on the wrapper div** — this makes the wrapper the *positioning context*. Any `absolute` child positions itself relative to this div, not to the whole page.
- **`absolute` on the `<ul>`** — removes the list from the normal flow so it overlaps elements below it.
- **`top-full`** — places the top edge of the dropdown at the bottom edge of the relative parent (i.e., just below the input).
- **`mt-1`** — adds a small gap between the input and the dropdown.
- **`w-full`** — makes the dropdown exactly as wide as the wrapper (and thus the input).
- **`z-10`** — ensures the dropdown renders on top of the other form fields below it.

---

### Step 5 — Selecting a result: the `onMouseDown` trick

Each result is a `<button>` inside the dropdown. When the user clicks one, two events fire in sequence:

1. `mousedown` on the button
2. `blur` on the input (because the input loses focus when the user clicks elsewhere)

The problem: our input has an `onBlur` handler that calls `fetchQuote()`. If `onBlur` fires before the button's `onClick`, React processes the blur first — which might close the dropdown or cause other side effects before the click registers.

The fix is to use `onMouseDown` instead of `onClick` on the dropdown buttons:

```tsx
<button
  type="button"
  onMouseDown={(e) => {
    e.preventDefault(); // prevents the input from losing focus
    selectSymbol(r.symbol);
  }}
>
```

`e.preventDefault()` on a `mousedown` event prevents the browser from shifting focus away from the input. This means `blur` on the input does NOT fire when the user clicks a dropdown item. The selection goes through cleanly.

After `selectSymbol` is called, focus naturally moves on — but now it is deliberate, not an accident.

```tsx
function selectSymbol(symbol: string) {
  setForm((prev) => ({ ...prev, ticker: symbol }));
  setSearchOpen(false);
  setSearchResults([]);
  fetchQuote(symbol); // auto-fetch the price for the selected ticker
}
```

---

### Step 6 — Closing on outside click

The dropdown should close when the user clicks anywhere outside the ticker field. This is not built into any HTML element — we have to implement it manually.

The standard pattern:

```tsx
const tickerWrapRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function onOutside(e: MouseEvent) {
    if (tickerWrapRef.current && !tickerWrapRef.current.contains(e.target as Node)) {
      setSearchOpen(false);
    }
  }
  document.addEventListener("mousedown", onOutside);
  return () => document.removeEventListener("mousedown", onOutside);
}, []);
```

Step by step:

1. **`tickerWrapRef`** — a ref attached to the wrapper `<div>` around the input and dropdown.
2. **`document.addEventListener("mousedown", onOutside)`** — listens to every click on the entire page.
3. **`tickerWrapRef.current.contains(e.target)`** — checks if the clicked element is *inside* the wrapper div. If it is, the user clicked inside the input or dropdown — do nothing. If it is outside, close the dropdown.
4. **`return () => document.removeEventListener(...)`** — the `useEffect` return value is a *cleanup function*. React calls it when the component unmounts (when the modal closes). Without this, the event listener would remain attached to `document` forever, causing a memory leak and potential errors.

**Why `useEffect` with an empty dependency array `[]`?**

An empty dependency array `[]` means "run this effect once, after the first render." Attaching a global event listener is a side effect that should only happen once — not on every render. The cleanup function handles removal.

---

### Step 7 — Escape key to close

A small but important keyboard accessibility improvement:

```tsx
<input
  onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
  ...
/>
```

Pressing Escape while the dropdown is open closes it. This is standard UX for any dropdown component and improves keyboard-only navigation.

---

### Full interaction flow recap

```
User types "APP"
  → onChange fires → form.ticker = "APP"
  → previous debounce timer cancelled
  → new 350ms timer started

350ms pass without another keystroke
  → runSearch("APP") called
  → GET /api/search?q=APP sent to server
  → server calls Finnhub, filters, returns [{symbol:"AAPL", name:"APPLE INC"}, ...]
  → setSearchResults([...]) → setSearchOpen(true)
  → dropdown renders below the input

User clicks "AAPL — APPLE INC"
  → onMouseDown fires → e.preventDefault() blocks blur
  → selectSymbol("AAPL") called
  → form.ticker = "AAPL"
  → dropdown closes
  → fetchQuote("AAPL") called → shows "current: $213.49 [use]"
```

---

## 22. Auto-refresh after mutations

After adding, editing, or deleting a transaction, the UI should update immediately — no F5 required. Achieving this reliably requires solving two separate problems.

---

### Problem 1: `useState` doesn't sync from new props

`TransactionsClient` stores the list of transactions in state:

```tsx
const [rows, setRows] = useState(initialRows);
```

`useState(initialRows)` only uses `initialRows` as the **initial value** — on the very first render. If the parent passes new `initialRows` props later (after `router.refresh()` causes the server to re-render), React does not automatically update the state. `rows` is stuck with the original data.

This means: adding a transaction via the modal calls `router.refresh()`, the server sends fresh data, but the list doesn't show the new row.

**The fix:**

```tsx
useEffect(() => {
  setRows(initialRows);
}, [initialRows]);
```

This `useEffect` watches the `initialRows` prop. Whenever it changes (which only happens after a server re-render), it syncs the local `rows` state with the new server data.

**Why doesn't this interfere with optimistic updates for edit/delete?**

For edit and delete, we call `setRows(...)` optimistically AND call `router.refresh()`. The server re-renders with the updated data. `initialRows` updates to the confirmed server data. The `useEffect` runs and sets `rows` to the server data — which already matches the optimistic update. No conflict.

---

### Problem 2: The Next.js Router Cache

Next.js keeps a client-side **Router Cache** — a short-lived in-memory store of recently visited pages. When you navigate from `/dashboard/transactions` back to `/dashboard`, Next.js may serve the cached version of the dashboard instead of re-fetching it from the server.

This means: adding a transaction on the transactions page and then navigating to the portfolio dashboard could show the old positions (before the new transaction was counted).

**The fix: `revalidatePath` in the API route handlers**

```ts
// In POST /api/transactions, PATCH /api/transactions/[id], DELETE /api/transactions/[id]
import { revalidatePath } from "next/cache";

// After the database operation:
revalidatePath("/dashboard");
revalidatePath("/dashboard/transactions");
```

When called from a Route Handler, `revalidatePath` sends a revalidation signal back to the client with the API response. Next.js clears the router cache for those paths. The next navigation to `/dashboard` fetches fresh data from the server.

**Why two paths?** A mutation can be initiated from either page. Revalidating both ensures freshness regardless of where the user navigates next.

---

### The full picture

| Scenario | Fix |
|---|---|
| Add transaction on transactions page → row doesn't appear | `useEffect` syncs `rows` from `initialRows` |
| Add transaction on dashboard → positions don't update | `router.refresh()` re-runs server component, props update |
| Any mutation → navigate to dashboard → shows stale data | `revalidatePath('/dashboard')` clears router cache |

Edit and delete already used optimistic updates (`setRows(...)`) for immediate feedback, so they were never slow — but they now also benefit from the cache invalidation for cross-page consistency.

---

## 23. Change password modal

Every authenticated user can change their own password. The feature follows the same modal pattern used throughout the app (see chapter 14).

---

### The API route: `PATCH /api/profile`

Unlike the admin reset-password route (which requires no current password), a self-service password change must verify the user knows their current password. This prevents someone who finds an unlocked session from silently changing the password.

```ts
// src/app/api/profile/route.ts
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });

  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } });

  return NextResponse.json({ success: true });
}
```

**Key points:**

- `session.user.id` is used to fetch the user — the route always operates on the logged-in user, not a client-provided ID.
- `bcrypt.compare(currentPassword, user.password)` verifies the current password against the stored hash. If wrong, returns `400` with a clear message.
- The new password is hashed with `bcrypt.hash(newPassword, 10)` before storing. Plain text passwords are never stored.

---

### The modal component

`ChangePasswordModal` (`src/components/change-password-modal.tsx`) renders a gear icon (⚙) button. Clicking it opens the modal.

The form has three fields:
- **Current Password** — verified server-side
- **New Password** — minimum 6 characters
- **Confirm New Password** — compared client-side before the request is sent

The client-side confirm check:

```tsx
if (form.newPassword !== form.confirmPassword) {
  setError("New passwords do not match");
  return; // don't send the request at all
}
```

This is a UX guard only — it saves a network round-trip for a common mistake. The real validation happens on the server.

After a successful update, the form shows a green "Password updated successfully." message and clears all fields. The modal stays open so the user can close it manually — this is intentional, giving them time to read the confirmation.

---

### Where it lives in the navbar

`ChangePasswordModal` is rendered directly in `Navbar` (`src/components/navbar.tsx`), between the app name and the Sign out button:

```tsx
<div className="flex items-center gap-4">
  <ChangePasswordModal />   {/* gear icon → modal */}
  <button onClick={() => signOut(...)}>Sign out</button>
</div>
```

The navbar is already a client component (`"use client"`), so adding another client component here has no extra cost.

---

## 24. Known gotchas reference

Collected from real problems encountered while building this project:

| Problem | Root cause | Solution |
|---|---|---|
| `url` deprecated in `schema.prisma` | Prisma 7 moved the URL to the config file | Use `prisma.config.ts` with `env("DATABASE_URL")` |
| `PrismaClient` fails to connect | Prisma 7 requires a driver adapter | Instantiate with `new PrismaPg({ connectionString })` and pass to `new PrismaClient({ adapter })` |
| `next-auth@stable` (v4) incompatible | v4 does not support the App Router | Install `next-auth@beta` (v5) |
| Middleware crashes with crypto error | Edge Runtime lacks Node.js `crypto` | Use `getToken` from `next-auth/jwt` (uses Web Crypto API) |
| `middleware.ts` deprecation warning | Next.js 16 renamed the convention | Use `proxy.ts` with `export async function proxy` |
| App stops loading entirely | Both `middleware.ts` and `proxy.ts` exist simultaneously | Delete `middleware.ts` — only `proxy.ts` must exist |
| `prisma generate` not run after migration | Prisma 7 removed auto-generate | Run `npx prisma generate` manually after schema changes |
| Recharts crashes on server | Recharts uses browser-only APIs | Gate chart renders on `mounted` state (set in `useEffect`) |
| Playwright tests fail on Ubuntu 26.04 | Ubuntu 26.04 not yet supported | Run `npx playwright test` from Windows PowerShell |
| Multiple Prisma Client instances in dev | Next.js hot reload creates new module instances | Store client on `globalThis` in development |
| Decimal rounding errors in positions | JavaScript `number` uses floating-point | Use Prisma's `Decimal` type; call `.toNumber()` only for display |
| Dashboard takes 10–20s to load | `getQuotes()` called server-side blocks SSR | Pass `initialQuotes: {}` and let the client fetch on mount |
| Quote lookup in modal fetches on every keystroke | `onChange` triggers too often | Use `onBlur` on the Ticker field — fires once when user leaves the field |
| Snapshot not saved when quotes move to client | Server no longer has quote values | POST to `/api/snapshot` from the client after the first successful quote fetch |
| Edit/delete API returns 403 for wrong user | Leaks that the resource exists | Return `404` for both "not found" and "not yours" — safer response |
| Quotes never appear on screen (all `—`) | WSL2 has no internet by default — all Finnhub fetches fail silently | Run `echo "nameserver 8.8.8.8" \| sudo tee /etc/resolv.conf` in WSL, then restart the dev server |
| Skeleton causes React hydration error | `<div>` is invalid inside `<p>` | Use `<span className="... inline-block">` for skeleton elements |
| Ticker search dropdown closes before item click registers | `onBlur` on the input fires before `onClick` on the dropdown button | Use `onMouseDown` + `e.preventDefault()` on dropdown items — prevents focus from shifting during the click |
| Outside-click listener leaks after modal closes | `document.addEventListener` was never removed | Always return a cleanup function from `useEffect` that calls `removeEventListener` |
| Debounce timer causes stale-closure issues | Timer ID stored in `useState` triggers unnecessary re-renders | Store timer ID in `useRef` — persists across renders without causing them |
| Adding a transaction doesn't update the list | `useState(initialRows)` only initializes once — new props don't sync | Add `useEffect(() => setRows(initialRows), [initialRows])` to sync on prop change |
| Dashboard shows stale data after mutation on another page | Next.js Router Cache serves old RSC payload on navigation | Call `revalidatePath('/dashboard')` in API route handlers after mutations |
| Change password: someone with an open session changes password silently | No current password required | Always verify current password with `bcrypt.compare` before updating |


## 25. Shuffle Portfolio

### What was built

A **"Shuffle Portfolio"** button in the portfolio empty state that generates a realistic demo portfolio with one click.

### How it works

1. Button is visible only when `positions.length === 0` (empty state in `portfolio-client.tsx`).
2. Clicking opens a confirmation modal warning that there is no undo.
3. Confirming calls `POST /api/shuffle`:
   - Picks 4–5 random tickers from a hardcoded pool: `AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META, JPM`.
   - For each ticker, generates 2–4 BUY transactions over the last 2 years with prices in a hardcoded realistic range per ticker.
   - 50% chance of 1 SELL per ticker — date always after the earliest BUY, quantity never exceeds half of total bought.
   - Generates weekly `PortfolioHistory` snapshots from the earliest transaction date to today (~104 points). Each ticker has a random start price (lower half of its range) trending to a random end price (upper half), linearly interpolated per week with ±5% noise. Total value at each week = sum of current holdings × simulated price.
   - Bulk-inserts transactions with `prisma.transaction.createMany` and history with `prisma.portfolioHistory.createMany`.
   - Calls `revalidatePath('/dashboard')` and `revalidatePath('/dashboard/transactions')`.
4. Client calls `router.refresh()` after success — the server component re-renders, `positions` is now non-empty, and the empty state (and the button) disappear. The line chart is immediately populated with ~2 years of history.

### Key files

- `src/app/api/shuffle/route.ts` — transaction + history generation and bulk insert logic
- `src/components/portfolio-client.tsx` — button and confirmation modal in the empty state block

### Gotchas

- The SELL's date is generated with `randDate(earliestBuyTime + 24h, now)`. Without the `+ 24h` guard, the SELL could land on the exact same millisecond as the BUY, which is technically valid but looks odd in the UI.

## 26. Docker

### What was built

A complete Docker setup that containerizes the app for production. The stack (Next.js app + PostgreSQL) runs via a single `docker compose up -d`. Dev workflow (`npm run dev`) is unchanged.

### Key files

- `Dockerfile` — 3-stage build: `deps` (npm ci), `builder` (prisma generate + next build), `runner` (standalone output only)
- `docker-compose.yml` — 4 services: `db` (postgres:17-alpine), `migrate` (builder target, runs once), `app` (runner), `seed` (profile: tools)
- `.dockerignore` — excludes node_modules, .next, .env*, tests, docs
- `.env.docker.example` — committed template; real `.env.docker` is gitignored

### How it works

**Multi-stage Dockerfile + standalone output**

`next.config.ts` sets `output: 'standalone'`, which tells Next.js to trace all dependencies and copy only the required node_modules into `.next/standalone/`. The final `runner` image is ~60% smaller than a naive copy of all node_modules, and contains only:
- `.next/standalone/` — the traced app (includes pg, @prisma/adapter-pg, etc.)
- `.next/static/` — bundled JS/CSS
- `public/` — static assets

The Prisma CLI is **not** in the runner — it has a deep dependency chain (notably `effect`, `@prisma/config`, schema-engine binary) that is difficult to surgically transplant without copying the entire `node_modules`. Putting the CLI in the runner was attempted and abandoned.

**Separate `migrate` service**

Instead of running migrations in the runner's entrypoint, a dedicated `migrate` service uses `target: builder` (the full builder stage with all node_modules) and runs:

```sh
node node_modules/.bin/prisma migrate deploy
```

Then exits. The `app` service depends on it with `condition: service_completed_successfully`. This means:
- On `docker compose up`: migrate runs first, exits 0, then app starts
- `migrate deploy` is idempotent — safe to re-run on every `up`
- The runner stays lean with zero CLI dependencies

**Two modes coexist**

| Mode | Command | DATABASE_URL |
|---|---|---|
| Dev | `npm run dev` | `localhost:5432` (existing postgres container) |
| Docker | `docker compose up -d` | `db:5432` (docker-compose internal network) |

The `db` service in docker-compose does **not** expose a host port — avoiding conflict with the dev postgres already on 5432.

**Seeding**

The `seed` service uses `target: builder` (has full devDeps + tsx) and runs under the `tools` profile:

```bash
docker compose --profile tools run --rm seed
```

### Gotchas

- **Prisma CLI não pertence ao runner**: tentar copiar `node_modules/prisma` + `node_modules/@prisma` do builder para o runner falha em runtime com `Cannot find module 'effect'` — `@prisma/config` depende do pacote `effect` (top-level dep não coberta pela cópia). A solução adotada foi o serviço `migrate` separado com `target: builder`.
- **Builder precisa de `DATABASE_URL` dummy**: `prisma.config.ts` chama `env("DATABASE_URL")` no load time — mesmo para `prisma generate` (que não conecta ao banco). O Dockerfile seta `ENV DATABASE_URL=postgresql://dummy:...` no builder stage para contornar isso.
- **`AUTH_TRUST_HOST=true` obrigatório em Docker**: Auth.js v5 em `NODE_ENV=production` valida o header `Host` da requisição. Em Docker ou atrás de proxy, o host pode não bater com o esperado. Sem esta variável, todas as chamadas a `/api/auth/session` retornam `UntrustedHost` e a página quebra com erro 500. Deve estar em `.env.docker`.
- **JWT antigo do dev server causa FK violation**: o `AUTH_SECRET` é o mesmo no dev e no Docker, então um cookie de sessão do dev server ainda é considerado válido no Docker — mas o `userId` embutido no JWT aponta para o ID do usuário na base dev, que não existe na base Docker. Sintoma: `ForeignKeyConstraintViolation` em qualquer operação que usa `session.user.id`. Solução: fazer logout e entrar novamente depois de trocar de ambiente.
- **`NEXTAUTH_URL` em produção**: deve ser o endereço real do servidor (IP ou domínio + porta) no `.env.docker`, caso contrário callbacks e redirects do Auth.js falham.
- History snapshots are only inserted for weeks where `totalValue > 0`, so the chart always starts at a meaningful first point rather than zero.
