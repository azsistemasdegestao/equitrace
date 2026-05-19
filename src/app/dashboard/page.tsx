import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { computePositions } from "@/lib/portfolio";
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

  // Lazy daily portfolio snapshot — triggered client-side via /api/snapshot after quotes load


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
        initialQuotes={{}}
        history={historyData}
      />
    </div>
  );
}
