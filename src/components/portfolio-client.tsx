"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Position = { ticker: string; quantity: number; avgCost: number };
type HistoryPoint = { date: string; value: number };

type Props = {
  positions: Position[];
  initialQuotes: Record<string, number>;
  history: HistoryPoint[];
};

const PIE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

function usd(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function yAxisTick(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function Skeleton({ wide = false }: { wide?: boolean }) {
  return (
    <span className={`h-4 ${wide ? "w-20" : "w-14"} bg-zinc-800 rounded animate-pulse inline-block`} />
  );
}

export default function PortfolioClient({ positions, initialQuotes, history }: Props) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Record<string, number>>(initialQuotes);
  const [mounted, setMounted] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(positions.length > 0);
  const [shuffleOpen, setShuffleOpen] = useState(false);
  const [shuffling, setShuffling] = useState(false);

  async function handleShuffle() {
    setShuffling(true);
    try {
      await fetch("/api/shuffle", { method: "POST" });
      setShuffleOpen(false);
      router.refresh();
    } finally {
      setShuffling(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (positions.length === 0) return;
    const tickers = positions.map((p) => p.ticker).join(",");
    let snapshotSaved = false;

    async function poll() {
      try {
        const res = await fetch(`/api/quotes?tickers=${tickers}`);
        if (!res.ok) return;
        const data: Record<string, number> = await res.json();
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
            }).catch(() => {});
          }
        }
      } catch {}
    }

    poll();
    const id = setInterval(poll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [positions]);

  const rows = positions.map((p) => {
    const currentPrice = quotes[p.ticker] ?? 0;
    const currentValue = p.quantity * currentPrice;
    const pnlPct = p.avgCost > 0 ? ((currentPrice - p.avgCost) / p.avgCost) * 100 : 0;
    return { ...p, currentPrice, currentValue, pnlPct };
  });

  const totalValue = rows.reduce((s, r) => s + r.currentValue, 0);

  const pieData = rows
    .filter((r) => r.currentValue > 0)
    .map((r) => ({ name: r.ticker, value: r.currentValue }));

  // Empty state
  if (positions.length === 0) {
    return (
      <>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-white font-semibold mb-1">No positions yet</p>
          <p className="text-zinc-400 text-sm mb-6">
            Add transactions manually or import a CSV file to see your portfolio.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard/transactions"
              className="bg-white text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-zinc-200 transition"
            >
              + Add Transaction
            </Link>
            <Link
              href="/dashboard/import"
              className="border border-zinc-700 text-zinc-300 text-sm font-medium px-5 py-2 rounded-lg hover:text-white hover:border-zinc-500 transition"
            >
              Import CSV / Excel
            </Link>
            <button
              onClick={() => setShuffleOpen(true)}
              className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-indigo-500 transition"
            >
              Shuffle Portfolio
            </button>
          </div>
        </div>

        {shuffleOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
              <h2 className="text-white font-semibold text-lg mb-2">Shuffle Portfolio</h2>
              <p className="text-zinc-400 text-sm mb-6">
                This will generate random buy and sell transactions for a demo portfolio. There is no undo.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShuffleOpen(false)}
                  disabled={shuffling}
                  className="border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg hover:text-white hover:border-zinc-500 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShuffle}
                  disabled={shuffling}
                  className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-500 transition disabled:opacity-50"
                >
                  {shuffling ? "Generating..." : "Shuffle"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-xs mb-1">Total Value</p>
          <p className="text-white text-xl font-bold">
            {quotesLoading ? <Skeleton wide /> : totalValue > 0 ? usd(totalValue) : "—"}
          </p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-xs mb-1">Assets</p>
          <p className="text-white text-xl font-bold">{positions.length}</p>
        </div>
      </div>

      {/* Charts */}
      {mounted && pieData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Pie chart */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-400 text-xs mb-3">Distribution</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                  formatter={(v) => usd(Number(v))}
                  labelStyle={{ color: "#fff", fontSize: 12 }}
                  itemStyle={{ color: "#a1a1aa" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {pieData.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1 text-xs text-zinc-400">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>

          {/* Line chart */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-400 text-xs mb-3">Portfolio History</p>
            {history.length >= 2 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={yAxisTick} width={44} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                    formatter={(v) => [usd(Number(v)), "Value"]}
                    labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-zinc-600 text-xs">Not enough history yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Positions table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Ticker</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap hidden sm:table-cell">Quantity</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Avg Cost</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap hidden sm:table-cell">Current Price</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Value</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.ticker} className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}>
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{row.ticker}</td>
                  <td className="px-4 py-3 text-white text-right whitespace-nowrap hidden sm:table-cell">
                    {row.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-4 py-3 text-white text-right whitespace-nowrap">{usd(row.avgCost)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap hidden sm:table-cell">
                    {quotesLoading ? <Skeleton /> : row.currentPrice > 0 ? <span className="text-white">{usd(row.currentPrice)}</span> : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {quotesLoading ? <Skeleton /> : row.currentValue > 0 ? <span className="text-white font-medium">{usd(row.currentValue)}</span> : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                    {quotesLoading ? <Skeleton /> : row.currentPrice > 0 ? (
                      <span className={row.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {row.pnlPct >= 0 ? "+" : ""}{row.pnlPct.toFixed(2)}%
                      </span>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
