import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json([]);

  const apiKey = process.env.FINNHUB_API_KEY;
  const res = await fetch(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`
  );
  if (!res.ok) return NextResponse.json([]);

  const data = await res.json();

  const results = ((data.result ?? []) as { description: string; displaySymbol: string; symbol: string; type: string }[])
    .filter((r) => r.type === "Common Stock" && !r.symbol.includes("."))
    .slice(0, 7)
    .map((r) => ({ symbol: r.displaySymbol, name: r.description }));

  return NextResponse.json(results);
}
