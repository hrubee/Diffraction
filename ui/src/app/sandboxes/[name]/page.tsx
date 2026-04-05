"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSandbox, getDraftPolicy } from "@/lib/api";
import type { Sandbox, DraftChunk } from "@/lib/api";
import StatusBadge from "@/components/status-badge";
import LogViewer from "@/components/log-viewer";
import ChatPanel from "@/components/chat-panel";
import DraftPolicyPanel from "@/components/draft-policy-panel";
import ActivePolicyPanel from "@/components/active-policy-panel";

type Tab = "overview" | "logs" | "chat" | "policy";

export default function SandboxDetailPage() {
  const params = useParams();
  const name = params.name as string;
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [draftChunks, setDraftChunks] = useState<DraftChunk[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [sb, draft] = await Promise.all([
          getSandbox(name),
          getDraftPolicy(name).catch(() => ({
            chunks: [],
            draft_version: 0,
            last_analyzed_at_ms: 0,
          })),
        ]);
        setSandbox(sb);
        setDraftChunks(draft.chunks);
        setPendingCount(
          draft.chunks.filter((c: DraftChunk) => c.status === "pending").length
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [name]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "logs", label: "Logs" },
    { key: "chat", label: "Chat" },
    { key: "policy", label: "Policy", badge: pendingCount || undefined },
  ];

  return (
    <div className="p-6 flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
          <Link href="/sandboxes" className="hover:text-zinc-300">
            Sandboxes
          </Link>
          <span>/</span>
          <span className="text-zinc-300">{name}</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{name}</h1>
          {sandbox && <StatusBadge phase={sandbox.phase} />}
          <button
            onClick={async () => {
              setRestarting(true);
              try {
                const r = await fetch(`/api/sandboxes/${encodeURIComponent(name)}/restart-gateway`, { method: "POST", credentials: "include" });
                const data = await r.json();
                if (data.healthy) {
                  setError(null);
                } else {
                  setError("Gateway restarted but not healthy yet — check logs");
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Restart failed");
              }
              setRestarting(false);
            }}
            disabled={restarting}
            className="ml-auto px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-md hover:text-white hover:border-zinc-500 disabled:opacity-50"
          >
            {restarting ? "Restarting..." : "Restart Gateway"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-700/50 mb-4">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm transition-colors relative ${
              tab === key
                ? "text-white border-b-2 border-indigo-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {tab === "overview" && sandbox && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Details
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">ID</dt>
                  <dd className="text-zinc-300 font-mono text-xs">
                    {sandbox.id}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Namespace</dt>
                  <dd className="text-zinc-300">{sandbox.namespace || "---"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Policy version</dt>
                  <dd className="text-zinc-300">
                    v{sandbox.current_policy_version || 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Created</dt>
                  <dd className="text-zinc-300">
                    {sandbox.created_at_ms
                      ? new Date(Number(sandbox.created_at_ms)).toLocaleString()
                      : "---"}
                  </dd>
                </div>
              </dl>
            </div>

            {sandbox.status?.conditions &&
              sandbox.status.conditions.length > 0 && (
                <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    Conditions
                  </h3>
                  <div className="space-y-2">
                    {sandbox.status.conditions.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-sm"
                      >
                        <span
                          className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                            c.status === "True"
                              ? "bg-emerald-400"
                              : "bg-red-400"
                          }`}
                        />
                        <div>
                          <div className="text-zinc-300">{c.type}</div>
                          {c.message && (
                            <div className="text-xs text-zinc-500">
                              {c.message}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}

        {tab === "logs" && <LogViewer sandboxName={name} />}

        {tab === "chat" && <ChatPanel sandboxName={name} />}

        {tab === "policy" && (
          <div className="space-y-8 overflow-y-auto h-full">
            <ActivePolicyPanel sandboxName={name} />
            <div className="border-t border-zinc-700/50 pt-6">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                Draft Recommendations
              </h3>
              <DraftPolicyPanel sandboxName={name} chunks={draftChunks} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
