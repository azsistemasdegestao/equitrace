import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

const POOL: Record<string, { min: number; max: number }> = {
  AAPL: { min: 165, max: 195 },
  MSFT: { min: 370, max: 425 },
  GOOGL: { min: 150, max: 185 },
  AMZN: { min: 170, max: 205 },
  TSLA: { min: 185, max: 280 },
  NVDA: { min: 750, max: 950 },
  META: { min: 450, max: 560 },
  JPM:  { min: 185, max: 225 },
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function randDate(startMs: number, endMs: number) {
  return new Date(startMs + Math.random() * (endMs - startMs));
}

// Linear interpolation between start/end price + ±5% noise
function simulatedPrice(start: number, end: number, progress: number) {
  const base = start + (end - start) * progress;
  return Math.max(base * (1 + (Math.random() - 0.5) * 0.1), 1);
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tickers = Object.keys(POOL).sort(() => Math.random() - 0.5).slice(0, randInt(4, 5));
  const now = Date.now();
  const twoYearsAgo = now - 2 * 365 * 24 * 60 * 60 * 1000;

  // ── 1. Generate transactions ────────────────────────────────────────────────
  type TxRow = {
    userId: string;
    ticker: string;
    type: "BUY" | "SELL";
    quantity: number;
    price: number;
    date: Date;
    brokerage: null;
  };

  const txData: TxRow[] = [];

  for (const ticker of tickers) {
    const { min, max } = POOL[ticker];
    const buyCount = randInt(2, 4);
    const buys: { date: Date; quantity: number }[] = [];

    for (let i = 0; i < buyCount; i++) {
      const date = randDate(twoYearsAgo, now);
      const quantity = randInt(1, 15);
      const price = parseFloat(rand(min, max).toFixed(2));
      buys.push({ date, quantity });
      txData.push({ userId: session.user.id, ticker, type: "BUY", quantity, price, date, brokerage: null });
    }

    // 50% chance of a SELL — date after earliest BUY, qty ≤ half of total bought
    if (Math.random() > 0.5) {
      const totalBought = buys.reduce((s, b) => s + b.quantity, 0);
      const earliestBuyTime = Math.min(...buys.map((b) => b.date.getTime()));
      const sellDate = randDate(earliestBuyTime + 24 * 60 * 60 * 1000, now);
      const sellQty = randInt(1, Math.max(1, Math.floor(totalBought / 2)));
      const sellPrice = parseFloat(rand(min, max).toFixed(2));
      txData.push({ userId: session.user.id, ticker, type: "SELL", quantity: sellQty, price: sellPrice, date: sellDate, brokerage: null });
    }
  }

  // ── 2. Generate weekly portfolio history snapshots ──────────────────────────
  const earliestMs = Math.min(...txData.filter((t) => t.type === "BUY").map((t) => t.date.getTime()));
  const spanMs = now - earliestMs;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // Each ticker trends from a random start price (lower half) to a random end price (upper half)
  const priceStart: Record<string, number> = {};
  const priceEnd: Record<string, number> = {};
  for (const ticker of tickers) {
    const { min, max } = POOL[ticker];
    const mid = (min + max) / 2;
    priceStart[ticker] = rand(min, mid);
    priceEnd[ticker] = rand(mid, max);
  }

  const historyData: { userId: string; totalValue: number; snapshotAt: Date }[] = [];

  for (let weekMs = earliestMs; weekMs <= now; weekMs += WEEK_MS) {
    // Holdings at this point in time
    const holdings: Record<string, number> = {};
    for (const tx of txData) {
      if (tx.date.getTime() > weekMs) continue;
      holdings[tx.ticker] = (holdings[tx.ticker] ?? 0) + (tx.type === "BUY" ? tx.quantity : -tx.quantity);
    }

    const progress = spanMs > 0 ? (weekMs - earliestMs) / spanMs : 1;
    let totalValue = 0;
    for (const [ticker, qty] of Object.entries(holdings)) {
      if (qty > 0) {
        totalValue += qty * simulatedPrice(priceStart[ticker], priceEnd[ticker], progress);
      }
    }

    if (totalValue > 0) {
      historyData.push({
        userId: session.user.id,
        totalValue: parseFloat(totalValue.toFixed(2)),
        snapshotAt: new Date(weekMs),
      });
    }
  }

  // ── 3. Bulk insert ──────────────────────────────────────────────────────────
  await prisma.transaction.createMany({ data: txData });
  await prisma.portfolioHistory.createMany({ data: historyData });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");

  return NextResponse.json({ txCount: txData.length, historyCount: historyData.length });
}
