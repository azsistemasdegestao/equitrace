"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function GearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const navItems = [
  { label: "Portfolio", href: "/dashboard" },
  { label: "Transactions", href: "/dashboard/transactions" },
  { label: "Import", href: "/dashboard/import" },
];

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <header className="border-b border-zinc-800 bg-black sticky top-0 z-10">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <span className="text-white font-bold text-lg">Equitrace</span>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/settings"
            className={`transition ${pathname === "/dashboard/settings" ? "text-white" : "text-zinc-400 hover:text-white"}`}
            title="Settings"
          >
            <GearIcon />
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-zinc-400 text-sm hover:text-white transition"
          >
            Sign out
          </button>
        </div>
      </div>

      <nav className="max-w-4xl mx-auto px-4 pb-0 flex gap-1 overflow-x-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`text-sm px-3 py-2 border-b-2 transition whitespace-nowrap ${
              pathname === item.href
                ? "border-white text-white"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/dashboard/admin"
            className={`text-sm px-3 py-2 border-b-2 transition whitespace-nowrap ${
              pathname === "/dashboard/admin"
                ? "border-white text-white"
                : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            Admin
          </Link>
        )}
      </nav>
    </header>
  );
}