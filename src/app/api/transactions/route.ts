import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(transactions);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const transaction = await prisma.transaction.create({
    data: {
      userId: session.user.id,
      ticker: (ticker as string).toUpperCase().trim(),
      type,
      quantity: qty,
      price: prc,
      date: new Date(date),
      brokerage: brokerage ? String(brokerage).trim() : null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/transactions");
  return NextResponse.json(transaction, { status: 201 });
}
