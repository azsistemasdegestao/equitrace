"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TransactionModal from "@/components/transaction-modal";

function Skeleton() {
  return <span className="h-4 w-16 bg-zinc-800 rounded animate-pulse inline-block" />;
}

type Row = {
  id: string;
  date: string;
  ticker: string;
  type: string;
  quantity: number;
  price: number;
  total: number;
};

type EditForm = {
  ticker: string;
  type: string;
  quantity: string;
  price: string;
  date: string;
};

function usd(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default function TransactionsClient({ rows: initialRows }: { rows: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [quotes, setQuotes] = useState<Record<string, number>>({});

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editQuoteLoading, setEditQuoteLoading] = useState(false);
  const [editCurrentQuote, setEditCurrentQuote] = useState<number | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(initialRows.length > 0);

  // Sync rows when the server re-renders after router.refresh()
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (rows.length === 0) return;
    const tickers = [...new Set(rows.map((r) => r.ticker))].join(",");

    async function poll() {
      try {
        const res = await fetch(`/api/quotes?tickers=${tickers}`);
        if (res.ok) {
          setQuotes(await res.json());
          setQuotesLoading(false);
        }
      } catch {}
    }

    poll();
    const id = setInterval(poll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [rows]);

  function openEdit(row: Row) {
    setEditRow(row);
    setEditForm({
      ticker: row.ticker,
      type: row.type,
      quantity: String(row.quantity),
      price: String(row.price),
      date: row.date,
    });
    setEditError("");
    setEditCurrentQuote(null);
  }

  function closeEdit() {
    if (editLoading) return;
    setEditRow(null);
    setEditForm(null);
  }

  function handleEditChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    if (name === "ticker") setEditCurrentQuote(null);
    setEditForm((p) => p ? ({ ...p, [name]: name === "ticker" ? value.toUpperCase() : value }) : p);
  }

  async function handleEditTickerBlur() {
    if (!editForm?.ticker) return;
    setEditQuoteLoading(true);
    setEditCurrentQuote(null);
    try {
      const res = await fetch(`/api/quotes?tickers=${editForm.ticker}`);
      if (res.ok) {
        const data = await res.json();
        if (data[editForm.ticker]) setEditCurrentQuote(data[editForm.ticker]);
      }
    } catch {}
    finally { setEditQuoteLoading(false); }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow || !editForm) return;
    setEditLoading(true);
    setEditError("");

    try {
      const res = await fetch(`/api/transactions/${editRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) {
        const data = await res.json();
        setEditError(data.error ?? "Something went wrong");
        return;
      }

      const updated = await res.json();
      const qty = parseFloat(updated.quantity);
      const prc = parseFloat(updated.price);
      setRows((prev) =>
        prev.map((r) =>
          r.id === editRow.id
            ? {
                ...r,
                ticker: updated.ticker,
                type: updated.type,
                quantity: qty,
                price: prc,
                total: qty * prc,
                date: new Date(updated.date).toISOString().slice(0, 10),
              }
            : r
        )
      );
      closeEdit();
      router.refresh();
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/transactions/${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== deleteId));
        setDeleteId(null);
        router.refresh();
      }
    } catch {}
    finally { setDeleteLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <TransactionModal />
      </div>

      {rows.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center">
          <p className="text-white font-semibold mb-1">No transactions yet</p>
          <p className="text-zinc-400 text-sm mb-6">Add a transaction manually or import a CSV file.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => document.querySelector<HTMLButtonElement>("[data-add-transaction]")?.click()}
              className="bg-white text-black text-sm font-semibold px-5 py-2 rounded-lg hover:bg-zinc-200 transition"
            >
              + Add Transaction
            </button>
            <Link
              href="/dashboard/import"
              className="border border-zinc-700 text-zinc-300 text-sm font-medium px-5 py-2 rounded-lg hover:text-white hover:border-zinc-500 transition"
            >
              Import CSV / Excel
            </Link>
          </div>
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
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap hidden sm:table-cell">Qty</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap hidden sm:table-cell">Price</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Paid</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Current</th>
                  <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">P&amp;L</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const currentPrice = quotes[row.ticker];
                  const currentValue = currentPrice != null ? row.quantity * currentPrice : null;
                  const pnl = row.type === "BUY" && currentValue != null ? currentValue - row.total : null;

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}
                    >
                      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{row.date}</td>
                      <td className="px-4 py-3 text-white font-medium whitespace-nowrap">{row.ticker}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          row.type === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white text-right whitespace-nowrap hidden sm:table-cell">
                        {row.quantity.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3 text-white text-right whitespace-nowrap hidden sm:table-cell">{usd(row.price)}</td>
                      <td className="px-4 py-3 text-white text-right whitespace-nowrap font-medium">{usd(row.total)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {quotesLoading ? <Skeleton /> : currentValue != null
                          ? <span className="text-white">{usd(currentValue)}</span>
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                        {quotesLoading ? <Skeleton /> : pnl != null
                          ? <span className={pnl >= 0 ? "text-emerald-400" : "text-red-400"}>{pnl >= 0 ? "+" : ""}{usd(pnl)}</span>
                          : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(row)} className="text-zinc-500 hover:text-white transition" title="Edit">
                            <PencilIcon />
                          </button>
                          <button onClick={() => setDeleteId(row.id)} className="text-zinc-500 hover:text-red-400 transition" title="Delete">
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRow && editForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-5">Edit Transaction</h2>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Ticker</label>
                <input name="ticker" value={editForm.ticker} onChange={handleEditChange} onBlur={handleEditTickerBlur} required maxLength={10}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Type</label>
                <select name="type" value={editForm.type} onChange={handleEditChange}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Quantity</label>
                <input name="quantity" type="number" value={editForm.quantity} onChange={handleEditChange} required min="0.000001" step="any"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 text-xs">Price (USD)</label>
                  {editQuoteLoading && <span className="text-zinc-500 text-xs">fetching...</span>}
                  {!editQuoteLoading && editCurrentQuote !== null && (
                    <span className="text-zinc-400 text-xs flex items-center gap-1">
                      current: {usd(editCurrentQuote)}
                      <button type="button" onClick={() => setEditForm((p) => p ? ({ ...p, price: String(editCurrentQuote) }) : p)}
                        className="text-indigo-400 hover:text-indigo-300 font-medium transition">use</button>
                    </span>
                  )}
                </div>
                <input name="price" type="number" value={editForm.price} onChange={handleEditChange} required min="0.000001" step="any"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Date</label>
                <input name="date" type="date" value={editForm.date} onChange={handleEditChange} required style={{ colorScheme: "dark" }}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600" />
              </div>
              {editError && <p className="text-red-400 text-xs">{editError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeEdit} disabled={editLoading}
                  className="flex-1 border border-zinc-700 text-zinc-400 text-sm py-2 rounded-lg hover:text-white hover:border-zinc-500 transition">Cancel</button>
                <button type="submit" disabled={editLoading}
                  className="flex-1 bg-white text-black text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50">
                  {editLoading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-xs text-center">
            <p className="text-white font-semibold mb-1">Delete transaction?</p>
            <p className="text-zinc-400 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} disabled={deleteLoading}
                className="flex-1 border border-zinc-700 text-zinc-400 text-sm py-2 rounded-lg hover:text-white hover:border-zinc-500 transition">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 bg-red-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-500 transition disabled:opacity-50">
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
