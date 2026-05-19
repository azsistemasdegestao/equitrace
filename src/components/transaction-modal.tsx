"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const today = () => new Date().toISOString().slice(0, 10);

function usd(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default function TransactionModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<number | null>(null);
  const [form, setForm] = useState({
    ticker: "",
    type: "BUY",
    quantity: "",
    price: "",
    date: today(),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    if (name === "ticker") setCurrentQuote(null);
    setForm((prev) => ({ ...prev, [name]: name === "ticker" ? value.toUpperCase() : value }));
  }

  async function handleTickerBlur() {
    if (!form.ticker) return;
    setQuoteLoading(true);
    setCurrentQuote(null);
    try {
      const res = await fetch(`/api/quotes?tickers=${form.ticker}`);
      if (res.ok) {
        const data = await res.json();
        if (data[form.ticker]) setCurrentQuote(data[form.ticker]);
      }
    } catch {}
    finally { setQuoteLoading(false); }
  }

  function handleOpen() {
    setError("");
    setCurrentQuote(null);
    setForm({ ticker: "", type: "BUY", quantity: "", price: "", date: today() });
    setOpen(true);
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="bg-white text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition"
      >
        + Add Transaction
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-5">New Transaction</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Ticker</label>
                <input
                  name="ticker"
                  value={form.ticker}
                  onChange={handleChange}
                  onBlur={handleTickerBlur}
                  required
                  maxLength={10}
                  placeholder="e.g. AAPL"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Type</label>
                <select
                  name="type"
                  value={form.type}
                  onChange={handleChange}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Quantity</label>
                <input
                  name="quantity"
                  type="number"
                  value={form.quantity}
                  onChange={handleChange}
                  required
                  min="0.000001"
                  step="any"
                  placeholder="0"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 text-xs">Price (USD)</label>
                  {quoteLoading && (
                    <span className="text-zinc-500 text-xs">fetching...</span>
                  )}
                  {!quoteLoading && currentQuote !== null && (
                    <span className="text-zinc-400 text-xs flex items-center gap-1">
                      current: {usd(currentQuote)}
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, price: String(currentQuote) }))}
                        className="text-indigo-400 hover:text-indigo-300 font-medium transition"
                      >
                        use
                      </button>
                    </span>
                  )}
                </div>
                <input
                  name="price"
                  type="number"
                  value={form.price}
                  onChange={handleChange}
                  required
                  min="0.000001"
                  step="any"
                  placeholder="0.00"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Date</label>
                <input
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={handleChange}
                  required
                  style={{ colorScheme: "dark" }}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600"
                />
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1 border border-zinc-700 text-zinc-400 text-sm py-2 rounded-lg hover:text-white hover:border-zinc-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-white text-black text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
