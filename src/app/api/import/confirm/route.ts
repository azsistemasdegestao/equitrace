import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import type { ParsedRow } from "../preview/route";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const rows: ParsedRow[] = body?.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to import" }, { status: 400 });
  }

  const data = rows.map((r) => ({
    userId: session.user.id,
    ticker: r.ticker,
    type: r.type,
    quantity: r.quantity,
    price: r.price,
    date: new Date(r.date),
    brokerage: r.brokerage ?? null,
  }));

  await prisma.transaction.createMany({ data });

  return NextResponse.json({ count: data.length });
}
