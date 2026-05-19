"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

const today = () => new Date().toISOString().slice(0, 10);

function usd(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

type SearchResult = { symbol: string; name: string };

export default function TransactionModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [currentQuote, setCurrentQuote] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    type: "BUY",
    quantity: "",
    price: "",
    date: today(),
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerWrapRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (tickerWrapRef.current && !tickerWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    if (name === "ticker") {
      setCurrentQuote(null);
      const upper = value.toUpperCase();
      setForm((prev) => ({ ...prev, ticker: upper }));
      // Debounced search
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (upper.length >= 1) {
        debounceRef.current = setTimeout(() => runSearch(upper), 350);
      } else {
        setSearchResults([]);
        setSearchOpen(false);
      }
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function runSearch(q: string) {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data: SearchResult[] = await res.json();
      setSearchResults(data);
      setSearchOpen(data.length > 0);
    } catch {}
  }

  function selectSymbol(symbol: string) {
    setForm((prev) => ({ ...prev, ticker: symbol }));
    setSearchOpen(false);
    setSearchResults([]);
    fetchQuote(symbol);
  }

  async function fetchQuote(ticker: string) {
    if (!ticker) return;
    setQuoteLoading(true);
    setCurrentQuote(null);
    try {
      const res = await fetch(`/api/quotes?tickers=${ticker}`);
      if (res.ok) {
        const data = await res.json();
        if (data[ticker]) setCurrentQuote(data[ticker]);
      }
    } catch {}
    finally { setQuoteLoading(false); }
  }

  async function handleTickerBlur() {
    // Small delay so click on dropdown item fires first
    setTimeout(() => {
      if (!searchOpen) fetchQuote(form.ticker);
    }, 150);
  }

  function handleOpen() {
    setError("");
    setCurrentQuote(null);
    setSearchResults([]);
    setSearchOpen(false);
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-5">New Transaction</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Ticker with search dropdown */}
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Ticker</label>
                <div ref={tickerWrapRef} className="relative">
                  <input
                    name="ticker"
                    value={form.ticker}
                    onChange={handleChange}
                    onBlur={handleTickerBlur}
                    onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
                    required
                    maxLength={10}
                    placeholder="e.g. AAPL"
                    autoComplete="off"
                    className="w-full bg-black border border-zinc-800 rounded-lg pl-3 pr-9 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                  />
                  {/* Search icon */}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => form.ticker.length >= 1 && runSearch(form.ticker)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.5" y1="16.5" x2="21" y2="21" />
                    </svg>
                  </button>

                  {/* Dropdown */}
                  {searchOpen && searchResults.length > 0 && (
                    <ul className="absolute z-10 top-full mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
                      {searchResults.map((r) => (
                        <li key={r.symbol}>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectSymbol(r.symbol); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800 transition"
                          >
                            <span className="text-white text-sm font-semibold w-16 shrink-0">{r.symbol}</span>
                            <span className="text-zinc-400 text-xs truncate">{r.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
