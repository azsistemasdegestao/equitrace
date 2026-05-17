"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-zinc-400 text-sm hover:text-white transition"
        >
          Sign out
        </button>
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