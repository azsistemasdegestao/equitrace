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
}

export interface InvalidRow {
  row: number;
  raw: Record<string, string>;
  reason: string;
}

function parseDate(raw: string): string | null {
  // MM/DD/YYYY
  const match = String(raw ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, mm, dd, yyyy] = match;
  const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T12:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseRows(records: Record<string, string>[]) {
  const valid: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];

  records.forEach((rec, i) => {
    const rowNum = i + 2; // 1-based + header
    const raw = rec;

    const rawDate = rec["DATA"] ?? rec["Date"] ?? rec["date"] ?? "";
    const rawOp = rec["Operation"] ?? rec["operation"] ?? rec["OPERATION"] ?? "";
    const rawSym = rec["SYM"] ?? rec["Sym"] ?? rec["sym"] ?? rec["ticker"] ?? rec["TICKER"] ?? "";
    const rawQty = rec["QTY"] ?? rec["Qty"] ?? rec["qty"] ?? rec["quantity"] ?? rec["QUANTITY"] ?? "";
    const rawPrice = rec["PRICE"] ?? rec["Price"] ?? rec["price"] ?? "";

    if (!rawDate && !rawOp && !rawSym && !rawQty && !rawPrice) return; // skip blank rows

    const date = parseDate(rawDate);
    if (!date) {
      invalid.push({ row: rowNum, raw, reason: `Invalid or missing date: "${rawDate}"` });
      return;
    }

    const opUpper = String(rawOp).toUpperCase().trim();
    if (opUpper !== "BUY" && opUpper !== "SELL") {
      invalid.push({ row: rowNum, raw, reason: `Invalid operation: "${rawOp}"` });
      return;
    }

    const ticker = String(rawSym).toUpperCase().trim();
    if (!ticker) {
      invalid.push({ row: rowNum, raw, reason: "Missing ticker (SYM)" });
      return;
    }

    const quantity = parseFloat(String(rawQty).replace(",", "."));
    if (isNaN(quantity) || quantity <= 0) {
      invalid.push({ row: rowNum, raw, reason: `Invalid quantity: "${rawQty}"` });
      return;
    }

    const price = parseFloat(String(rawPrice).replace(",", "."));
    if (isNaN(price) || price <= 0) {
      invalid.push({ row: rowNum, raw, reason: `Invalid price: "${rawPrice}"` });
      return;
    }

    valid.push({ date, ticker, type: opUpper as "BUY" | "SELL", quantity, price });
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
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
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
