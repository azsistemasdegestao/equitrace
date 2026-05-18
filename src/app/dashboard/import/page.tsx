import ImportClient from "@/components/import-client";

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Import Transactions</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Upload a CSV or Excel file to bulk-import transactions.
        </p>
      </div>

      <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
        <p className="text-zinc-400 text-xs font-medium mb-1">Expected columns</p>
        <p className="text-zinc-500 text-xs">
          <span className="text-zinc-300">DATA</span> (MM/DD/YYYY) &nbsp;·&nbsp;
          <span className="text-zinc-300">Operation</span> (BUY / SELL) &nbsp;·&nbsp;
          <span className="text-zinc-300">SYM</span> &nbsp;·&nbsp;
          <span className="text-zinc-300">QTY</span> &nbsp;·&nbsp;
          <span className="text-zinc-300">PRICE</span>
        </p>
      </div>

      <ImportClient />
    </div>
  );
}
