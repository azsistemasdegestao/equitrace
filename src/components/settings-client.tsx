"use client";

import { useState } from "react";

export default function SettingsClient({ name, email }: { name: string; email: string }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    setSuccess(false);
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (form.newPassword !== form.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setSuccess(true);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-md">
      {/* Profile info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-zinc-400 text-xs mb-3">Account</p>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Name</span>
            <span className="text-white text-sm font-medium">{name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Email</span>
            <span className="text-white text-sm font-medium">{email}</span>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-zinc-400 text-xs mb-4">Change Password</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Current Password</label>
            <input
              type="password"
              name="currentPassword"
              value={form.currentPassword}
              onChange={handleChange}
              required
              autoComplete="current-password"
              className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1 block">New Password</label>
            <input
              type="password"
              name="newPassword"
              value={form.newPassword}
              onChange={handleChange}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="text-zinc-400 text-xs mb-1 block">Confirm New Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-emerald-400 text-xs">Password updated successfully.</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-white text-black text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50"
          >
            {loading ? "Saving..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
