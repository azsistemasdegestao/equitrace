import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedRow {
  date: string;
  ticker: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  brokerage: string | null;
}

export interface InvalidRow {
  row: number;
  raw: Record<string, string>;
  reason: string;
}

// YYYY-MM-DD → ISO string.
function parseDate(raw: string): string | null {
  const dateString = String(raw ?? "").trim();
  const parsed = new Date(dateString);
  const isValid = !isNaN(parsed.getTime());
  if (!isValid) return null;
  return parsed.toISOString();
}

// "buy" → "BUY", "sell" → "SELL". Case-insensitive.
function normalizeOperation(raw: string): "BUY" | "SELL" | null {
  const upper = String(raw).toUpperCase().trim();
  if (upper === "BUY") return "BUY";
  if (upper === "SELL") return "SELL";
  return null;
}

// Dot decimal, comma thousands: "2,670.95" → 2670.95
function parsePrice(raw: string): number {
  return parseFloat(String(raw).trim().replace(/,/g, ""));
}

// Standard dot decimal: "2.00", "1.71" → parse directly
function parseQuantity(raw: string): number {
  return parseFloat(String(raw).trim());
}

function parseRows(records: Record<string, string>[]) {
  const valid: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];

  records.forEach((rec, i) => {
    const rowNum = i + 2; // 1-based + header
    const raw = rec;

    const rawDate = rec["Date"] ?? rec["date"] ?? rec["DATE"] ?? "";
    const rawOp = rec["Type"] ?? rec["type"] ?? rec["Operation"] ?? rec["operation"] ?? "";
    const rawSym = rec["Ticker"] ?? rec["ticker"] ?? rec["SYM"] ?? rec["sym"] ?? "";
    const rawQty = rec["Quantity"] ?? rec["quantity"] ?? rec["QTY"] ?? rec["qty"] ?? "";
    const rawPrice = rec["Price (USD)"] ?? rec["PRICE"] ?? rec["Price"] ?? rec["price"] ?? "";

    if (!rawDate && !rawOp && !rawSym && !rawQty && !rawPrice) return; // skip blank rows

    const date = parseDate(rawDate);
    if (!date) {
      invalid.push({ row: rowNum, raw, reason: `Invalid or missing date: "${rawDate}"` });
      return;
    }

    const type = normalizeOperation(rawOp);
    if (!type) {
      invalid.push({ row: rowNum, raw, reason: `Invalid operation: "${rawOp}"` });
      return;
    }

    const ticker = String(rawSym).toUpperCase().trim();
    if (!ticker) {
      invalid.push({ row: rowNum, raw, reason: "Missing ticker (SYM)" });
      return;
    }

    const quantity = parseQuantity(rawQty);
    if (isNaN(quantity) || quantity <= 0) {
      invalid.push({ row: rowNum, raw, reason: `Invalid quantity: "${rawQty}"` });
      return;
    }

    const price = parsePrice(rawPrice);
    if (isNaN(price) || price <= 0) {
      invalid.push({ row: rowNum, raw, reason: `Invalid price: "${rawPrice}"` });
      return;
    }

    valid.push({ date, ticker, type, quantity, price, brokerage: null });
  });

  return { valid, invalid };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const filename = file.name.toLowerCase();
  let records: Record<string, string>[] = [];

  if (filename.endsWith(".csv")) {
    const text = await file.text();
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, delimiter: ";" });
    records = result.data;
  } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    records = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
  } else {
    return NextResponse.json({ error: "Unsupported file format. Upload a .csv or .xlsx file." }, { status: 400 });
  }

  const { valid, invalid } = parseRows(records);

  // detect tickers that already have transactions for this user
  const incomingTickers = [...new Set(valid.map((r) => r.ticker))];
  const existing = await prisma.transaction.findMany({
    where: { userId: session.user.id, ticker: { in: incomingTickers } },
    select: { ticker: true },
  });
  const existingTickers = [...new Set(existing.map((t) => t.ticker))];

  return NextResponse.json({ valid, invalid, existingTickers });
}
