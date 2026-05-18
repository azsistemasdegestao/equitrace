import { auth } from "@/lib/auth";
import { getQuotes } from "@/lib/finnhub";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tickers = searchParams
    .get("tickers")
    ?.split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean) ?? [];

  if (tickers.length === 0) return NextResponse.json({});

  const quotes = await getQuotes(tickers);
  return NextResponse.json(quotes);
}
