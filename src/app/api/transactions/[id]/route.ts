import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

async function ownsTransaction(userId: string, id: string) {
  const t = await prisma.transaction.findUnique({ where: { id } });
  return t?.userId === userId ? t : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await ownsTransaction(session.user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { ticker, type, quantity, price, date, brokerage } = body;

  if (!ticker || !type || !quantity || !price || !date) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (!["BUY", "SELL"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const qty = parseFloat(quantity);
  const prc = parseFloat(price);

  if (isNaN(qty) || qty <= 0 || isNaN(prc) || prc <= 0) {
    return NextResponse.json({ error: "Quantity and price must be positive numbers" }, { status: 400 });
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ticker: (ticker as string).toUpperCase().trim(),
      type,
      quantity: qty,
      price: prc,
      date: new Date(date),
      brokerage: brokerage ? String(brokerage).trim() : null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await ownsTransaction(session.user.id, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.transaction.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
