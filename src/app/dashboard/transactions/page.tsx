import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import TransactionModal from "@/components/transaction-modal";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatUSD(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default async function TransactionsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
  });

  const rows = transactions.map((t) => ({
    id: t.id,
    date: formatDate(t.date),
    ticker: t.ticker,
    type: t.type,
    quantity: t.quantity.toNumber(),
    price: t.price.toNumber(),
    total: t.quantity.toNumber() * t.price.toNumber(),
    brokerage: t.brokerage ?? "",
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <TransactionModal />
      </div>

      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-zinc-400 text-sm">No transactions yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Add your first transaction to get started.</p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Ticker</th>
                  <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Type</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Quantity</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Price</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Total</th>
                  <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Brokerage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}
                  >
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{row.ticker}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          row.type === "BUY"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white text-right whitespace-nowrap">
                      {row.quantity.toLocaleString("en-US")}
                    </td>
                    <td className="px-4 py-3 text-white text-right whitespace-nowrap">
                      {formatUSD(row.price)}
                    </td>
                    <td className="px-4 py-3 text-white text-right whitespace-nowrap font-medium">
                      {formatUSD(row.total)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">
                      {row.brokerage || <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
