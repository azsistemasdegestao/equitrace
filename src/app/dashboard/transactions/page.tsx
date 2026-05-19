import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import TransactionsClient from "@/components/transactions-client";

export default async function TransactionsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
  });

  const rows = transactions.map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    ticker: t.ticker,
    type: t.type,
    quantity: t.quantity.toNumber(),
    price: t.price.toNumber(),
    total: t.quantity.toNumber() * t.price.toNumber(),
    brokerage: t.brokerage ?? "",
  }));

  return <TransactionsClient rows={rows} />;
}
