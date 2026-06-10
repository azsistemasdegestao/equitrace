# Equitrace

A mobile-first web application for tracking US stock investments (NYSE/NASDAQ). Log buy/sell transactions, track average cost, and visualize portfolio performance over time.

## Features

- **Portfolio dashboard** — total value, allocation pie chart, historical line chart, positions table with live P&L
- **Transactions** — add, edit, and delete BUY/SELL operations with live quote lookup and ticker search autocomplete
- **CSV/Excel import** — bulk-import transactions from a semicolon-delimited file
- **Live quotes** — Finnhub integration with 5-minute polling
- **Shuffle Portfolio** — one-click demo portfolio generator (visible only on empty portfolio); seeds realistic transactions and 2 years of portfolio history
- **Admin** — user management panel (ADMIN role only)
- **Authentication** — JWT-based login with email + password
- **Change password** — users can update their own password via a modal (gear icon in the navbar)

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [Prisma 7](https://www.prisma.io) + PostgreSQL
- [Auth.js v5](https://authjs.dev) (next-auth@beta)
- [Tailwind CSS](https://tailwindcss.com)
- [Recharts](https://recharts.org)
- [Finnhub](https://finnhub.io)

## Getting started

### Option A — Docker (full stack, recommended)

Runs the app + PostgreSQL in containers. No Node.js installation required.

**Prerequisites:** Docker + Docker Compose

```bash
# 1. Configure environment
cp .env.docker.example .env.docker
# Edit .env.docker: set FINNHUB_API_KEY and strong AUTH_SECRET values

# 2. Build and start
docker compose build
docker compose up -d

# 3. Seed the admin user (first time only)
docker compose --profile tools run --rm seed
```

Open [http://localhost:3000](http://localhost:3000). Log in with `admin@wallet.com` / `admin123`.

> **Note:** `.env.docker` must contain `AUTH_TRUST_HOST=true` (already present in the example file) — required by Auth.js v5 when running in Docker.

---

### Option B — Local dev

**Prerequisites:** Node.js 22+, Docker (for PostgreSQL only)

#### 1. Start the database

```bash
docker run --name wallet-postgres \
  -e POSTGRES_USER=wallet \
  -e POSTGRES_PASSWORD=wallet123 \
  -e POSTGRES_DB=wallet_dev \
  -p 5432:5432 \
  -d postgres:17-alpine
```

#### 2. Configure environment

Create a `.env` file:

```env
DATABASE_URL="postgresql://wallet:wallet123@localhost:5432/wallet_dev"
AUTH_SECRET="your-secret-here"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
FINNHUB_API_KEY="your-finnhub-key"
```

Get a free Finnhub API key at [finnhub.io](https://finnhub.io).

#### 3. Install dependencies and run migrations

```bash
npm install
npx prisma migrate dev
tsx prisma/seed.ts     # creates admin@wallet.com / admin123
```

#### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in with `admin@wallet.com` / `admin123`.

## CSV import format

Semicolon-delimited, UTF-8:

```
Date;Type;Ticker;Quantity;Price (USD)
2022-03-09;buy;AAPL;10;165.32
2023-01-15;buy;VNQ;5;87.74
2023-06-20;sell;AAPL;3;185.00
```

A sample file can be downloaded directly from the Import page.

## Documentation

- **[TUTORIAL.md](TUTORIAL.md)** — full walkthrough of how the app was built, every decision explained
- **[CLAUDE.md](CLAUDE.md)** — guidance for AI-assisted development on this codebase
