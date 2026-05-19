"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRow, InvalidRow } from "@/app/api/import/preview/route";

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function ImportClient() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [valid, setValid] = useState<ParsedRow[]>([]);
  const [invalid, setInvalid] = useState<InvalidRow[]>([]);
  const [existingTickers, setExistingTickers] = useState<string[]>([]);

  const [confirming, setConfirming] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setValid([]);
    setInvalid([]);
    setExistingTickers([]);
    setImported(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Preview failed.");
        return;
      }

      setValid(data.valid);
      setInvalid(data.invalid);
      setExistingTickers(data.existingTickers);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    setError("");

    try {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: valid }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        return;
      }

      setImported(data.count);
      setValid([]);
      setInvalid([]);
      setExistingTickers([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConfirming(false);
    }
  }

  function handleReset() {
    setValid([]);
    setInvalid([]);
    setExistingTickers([]);
    setError("");
    setImported(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasConflicts = existingTickers.length > 0;
  const showPreview = valid.length > 0 || invalid.length > 0;

  function downloadSample() {
    const csv = [
      "Date;Type;Ticker;Quantity;Price (USD)",
      "2022-03-09;buy;AAPL;10;165.32",
      "2023-01-15;buy;VNQ;5;87.74",
      "2023-02-02;sell;MSFT;1;310.50",
    ].join("\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Upload area */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <label className="text-zinc-400 text-xs mb-2 block">Upload file (.csv or .xlsx)</label>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          disabled={loading}
          className="w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-zinc-200 file:cursor-pointer disabled:opacity-50"
        />
        {loading && <p className="text-zinc-500 text-xs mt-3">Parsing file…</p>}

        <div className="mt-4 flex items-center gap-3">
          <span className="text-zinc-600 text-xs">Not sure about the format?</span>
          <button
            type="button"
            onClick={downloadSample}
            className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition"
          >
            Download sample file
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {imported !== null && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-emerald-400 text-sm font-medium">
            {imported} transaction{imported !== 1 ? "s" : ""} imported successfully.
          </p>
          <button onClick={handleReset} className="text-zinc-400 text-xs hover:text-white transition">
            Import another
          </button>
        </div>
      )}

      {showPreview && (
        <>
          {/* Conflict warning */}
          {hasConflicts && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
              <p className="text-amber-400 text-sm font-medium">
                Existing transactions found for: {existingTickers.join(", ")}
              </p>
              <p className="text-amber-400/70 text-xs mt-0.5">
                Clicking Confirm will add these rows on top of existing data.
              </p>
            </div>
          )}

          {/* Valid rows */}
          {valid.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <span className="text-white text-sm font-semibold">
                  Valid rows ({valid.length})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    disabled={confirming}
                    className="text-zinc-400 text-xs hover:text-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="bg-white text-black text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50"
                  >
                    {confirming ? "Importing…" : "Confirm Import"}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Date</th>
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Ticker</th>
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Type</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Quantity</th>
                      <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valid.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}
                      >
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                          {row.ticker}
                          {existingTickers.includes(row.ticker) && (
                            <span className="ml-1.5 text-amber-400 text-xs">existing</span>
                          )}
                        </td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invalid rows */}
          {invalid.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <span className="text-red-400 text-sm font-semibold">
                  Rejected rows ({invalid.length})
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">#</th>
                      <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalid.map((row, i) => (
                      <tr key={i} className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}>
                        <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">Row {row.row}</td>
                        <td className="px-4 py-3 text-red-400 text-xs">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
