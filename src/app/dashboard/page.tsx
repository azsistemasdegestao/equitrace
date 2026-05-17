import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Portfolio</h1>
      <p className="text-zinc-400 text-sm mb-8">
        Welcome back, {session.user?.name}
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-xs mb-1">Total Value</p>
          <p className="text-white text-xl font-bold">$ —</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <p className="text-zinc-400 text-xs mb-1">Assets</p>
          <p className="text-white text-xl font-bold">—</p>
        </div>
      </div>
    </div>
  );
}