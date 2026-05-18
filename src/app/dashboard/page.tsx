import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { computePositions } from "@/lib/portfolio";
import { getQuotes } from "@/lib/finnhub";
import PortfolioClient from "@/components/portfolio-client";
import TransactionModal from "@/components/transaction-modal";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;

  const transactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  const positions = computePositions(
    transactions.map((t) => ({
      ticker: t.ticker,
      type: t.type as "BUY" | "SELL",
      quantity: t.quantity.toNumber(),
      price: t.price.toNumber(),
      date: t.date,
    }))
  );

  const tickers = positions.map((p) => p.ticker);
  const quotes = tickers.length > 0 ? await getQuotes(tickers) : {};

  // Lazy daily portfolio snapshot
  if (positions.length > 0) {
    const totalValue = positions.reduce((sum, p) => sum + p.quantity * (quotes[p.ticker] ?? 0), 0);
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

  const history = await prisma.portfolioHistory.findMany({
    where: { userId },
    orderBy: { snapshotAt: "asc" },
  });

  const historyData = history.map((h) => ({
    date: h.snapshotAt.toISOString().slice(0, 10),
    value: h.totalValue.toNumber(),
  }));

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Portfolio</h1>
        <TransactionModal />
      </div>
      <p className="text-zinc-400 text-sm mb-8">Welcome back, {session.user?.name}</p>

      <PortfolioClient
        positions={positions}
        initialQuotes={quotes}
        history={historyData}
      />
    </div>
  );
}
