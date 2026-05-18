"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  createdAt: string;
}

interface Props {
  users: UserRow[];
  currentUserId: string;
}

const emptyForm = { name: "", email: "", password: "", role: "USER" as "ADMIN" | "USER" };

export default function AdminClient({ users, currentUserId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create modal
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Reset password modal
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  function handleCreateChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setCreateForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create user"); return; }
      setCreating(false);
      setCreateForm(emptyForm);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to delete user"); return; }
      setDeletingId(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resettingId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${resettingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to reset password"); return; }
      setResettingId(null);
      setNewPassword("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* User table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-white text-sm font-semibold">Users ({users.length})</span>
          <button
            onClick={() => { setError(""); setCreateForm(emptyForm); setCreating(true); }}
            className="bg-white text-black text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-zinc-200 transition"
          >
            + Add User
          </button>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Name</th>
                <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Email</th>
                <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Role</th>
                <th className="text-left text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Created</th>
                <th className="text-right text-zinc-400 font-medium px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, i) => (
                <tr key={user.id} className={`border-b border-zinc-800 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}>
                  <td className="px-4 py-3 text-white font-medium whitespace-nowrap">
                    {user.name}
                    {user.id === currentUserId && (
                      <span className="ml-1.5 text-zinc-500 text-xs">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{user.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      user.role === "ADMIN"
                        ? "bg-violet-500/15 text-violet-400"
                        : "bg-zinc-700/50 text-zinc-400"
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{user.createdAt}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      {deletingId === user.id ? (
                        <>
                          <span className="text-zinc-400 text-xs">Delete?</span>
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={loading}
                            className="text-xs text-red-400 hover:text-red-300 transition disabled:opacity-50"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-xs text-zinc-400 hover:text-white transition"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setError(""); setNewPassword(""); setResettingId(user.id); }}
                            className="text-xs text-zinc-400 hover:text-white transition"
                          >
                            Reset password
                          </button>
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => { setError(""); setDeletingId(user.id); }}
                              className="text-xs text-red-500 hover:text-red-400 transition"
                            >
                              Delete
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create user modal */}
      {creating && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !loading) setCreating(false); }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-5">New User</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Name</label>
                <input
                  name="name"
                  value={createForm.name}
                  onChange={handleCreateChange}
                  required
                  placeholder="Full name"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Email</label>
                <input
                  name="email"
                  type="email"
                  value={createForm.email}
                  onChange={handleCreateChange}
                  required
                  placeholder="user@example.com"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Password</label>
                <input
                  name="password"
                  type="password"
                  value={createForm.password}
                  onChange={handleCreateChange}
                  required
                  minLength={6}
                  placeholder="Min. 6 characters"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">Role</label>
                <select
                  name="role"
                  value={createForm.role}
                  onChange={handleCreateChange}
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-zinc-600"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  disabled={loading}
                  className="flex-1 border border-zinc-700 text-zinc-400 text-sm py-2 rounded-lg hover:text-white hover:border-zinc-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-white text-black text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50"
                >
                  {loading ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resettingId && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !loading) { setResettingId(null); setNewPassword(""); } }}
        >
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-1">Reset Password</h2>
            <p className="text-zinc-400 text-xs mb-5">
              {users.find((u) => u.id === resettingId)?.email}
            </p>
            <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
              <div>
                <label className="text-zinc-400 text-xs mb-1 block">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min. 6 characters"
                  className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setResettingId(null); setNewPassword(""); }}
                  disabled={loading}
                  className="flex-1 border border-zinc-700 text-zinc-400 text-sm py-2 rounded-lg hover:text-white hover:border-zinc-500 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-white text-black text-sm font-semibold py-2 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50"
                >
                  {loading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
