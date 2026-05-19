import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsClient from "@/components/settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      <p className="text-zinc-400 text-sm mb-8">Manage your account.</p>
      <SettingsClient name={session.user.name ?? ""} email={session.user.email ?? ""} />
    </div>
  );
}
