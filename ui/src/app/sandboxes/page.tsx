"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listSandboxes, deleteSandbox } from "@/lib/api";
import type { Sandbox } from "@/lib/api";
import StatusBadge from "@/components/status-badge";

export default function SandboxesPage() {
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const deletingRef = useRef<Set<string>>(new Set());

  const load = async () => {
    try {
      const data = await listSandboxes();
      setSandboxes(data.sandboxes);
      // Clear any names from deleting set that are no longer in the list
      const names = new Set(data.sandboxes.map((s: Sandbox) => s.name));
      const nowGone = [...deletingRef.current].filter((n) => !names.has(n));
      if (nowGone.length > 0) {
        const next = new Set(deletingRef.current);
        nowGone.forEach((n) => next.delete(n));
        deletingRef.current = next;
        setDeleting(new Set(next));
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete sandbox "${name}"? This cannot be undone.`)) return;
    try {
      const result = await deleteSandbox(name);
      if (!result.deleted) {
        alert("Delete failed — server did not confirm removal.");
        return;
      }
      // Mark as pending-delete
      const next = new Set(deletingRef.current);
      next.add(name);
      deletingRef.current = next;
      setDeleting(new Set(next));

      // Poll every 15s up to 30min until gone (k8s teardown is async)
      const deadline = Date.now() + 1_800_000;
      const poll = setInterval(async () => {
        try {
          const data = await listSandboxes();
          setSandboxes(data.sandboxes);
          const stillThere = data.sandboxes.some((s: Sandbox) => s.name === name);
          if (!stillThere) {
            clearInterval(poll);
            const next2 = new Set(deletingRef.current);
            next2.delete(name);
            deletingRef.current = next2;
            setDeleting(new Set(next2));
          } else if (Date.now() >= deadline) {
            clearInterval(poll);
            const next2 = new Set(deletingRef.current);
            next2.delete(name);
            deletingRef.current = next2;
            setDeleting(new Set(next2));
            alert("Delete still pending — refresh to check.");
          }
        } catch {
          // network hiccup — keep polling
        }
      }, 15_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const age = (ms: string) => {
    if (!ms) return "---";
    const diff = Date.now() - Number(ms);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(diff / 60000)}m`;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sandboxes</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Isolated agent environments
          </p>
        </div>
        <Link
          href="/sandboxes/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          New Sandbox
        </Link>
      </div>

      <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Loading...
          </div>
        ) : sandboxes.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No sandboxes found
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700/50 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Age</th>
                <th className="text-left p-3 font-medium">Policy</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sandboxes.map((sb) => {
                const isPendingDelete = deleting.has(sb.name);
                return (
                  <tr
                    key={sb.id || sb.name}
                    className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors${isPendingDelete ? " opacity-60" : ""}`}
                  >
                    <td className="p-3">
                      <Link
                        href={`/sandboxes/${sb.name}`}
                        className="text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        {sb.name}
                      </Link>
                    </td>
                    <td className="p-3">
                      <StatusBadge phase={sb.phase} />
                    </td>
                    <td className="p-3 text-zinc-400">
                      {isPendingDelete ? (
                        <span className="inline-flex items-center gap-1.5 text-zinc-500">
                          <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Deleting
                        </span>
                      ) : (
                        age(sb.created_at_ms)
                      )}
                    </td>
                    <td className="p-3 text-zinc-400">
                      v{sb.current_policy_version || 0}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDelete(sb.name)}
                        disabled={isPendingDelete}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
