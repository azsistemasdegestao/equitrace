import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { totalValue } = await request.json();
  if (typeof totalValue !== "number" || totalValue <= 0) {
    return new NextResponse(null, { status: 204 });
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.portfolioHistory.findFirst({
    where: { userId: session.user.id, snapshotAt: { gte: todayStart } },
  });

  if (!existing) {
    await prisma.portfolioHistory.create({
      data: { userId: session.user.id, totalValue },
    });
  }

  return new NextResponse(null, { status: 204 });
}
