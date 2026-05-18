import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import AdminClient from "@/components/admin-client";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as "ADMIN" | "USER",
    createdAt: u.createdAt.toISOString().slice(0, 10),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Admin</h1>
        <p className="text-zinc-400 text-sm mt-1">Manage user accounts.</p>
      </div>
      <AdminClient users={rows} currentUserId={session.user.id} />
    </div>
  );
}
