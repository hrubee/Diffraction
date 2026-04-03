"use client";

import { useEffect, useState } from "react";
import {
  getActivePolicy,
  revokeNetworkPolicy,
} from "@/lib/api";
import type { ActivePolicy, NetworkPolicyRule } from "@/lib/api";

// No hardcoded baseline rules — they're fetched dynamically from the API
// based on the v1 (creation-time) policy history.

export default function ActivePolicyPanel({
  sandboxName,
}: {
  sandboxName: string;
}) {
  const [policy, setPolicy] = useState<ActivePolicy | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await getActivePolicy(sandboxName);
      setPolicy(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policy");
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [sandboxName]);

  const handleRevoke = async (ruleName: string) => {
    setRevoking(ruleName);
    setConfirmRevoke(null);
    try {
      const result = await revokeNetworkPolicy(sandboxName, ruleName);
      setMessage(
        `Revoked "${ruleName}". Policy updated to v${result.version}`
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to revoke");
    }
    setRevoking(null);
  };

  const rules = policy
    ? Object.entries(policy.network_policies)
    : [];

  const baselineSet = new Set(policy?.baseline_rules || []);
  const systemRules = rules.filter(([key]) => baselineSet.has(key));
  const userRules = rules.filter(([key]) => !baselineSet.has(key));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Active Network Policies
        </h3>
        {policy && (
          <span className="text-xs text-zinc-600">
            v{policy.version} &middot; {rules.length} rule{rules.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {message && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-300">
          {message}
          <button
            onClick={() => setMessage(null)}
            className="ml-2 text-zinc-500 hover:text-white"
          >
            dismiss
          </button>
        </div>
      )}

      {rules.length === 0 && !error && (
        <div className="text-center text-sm text-zinc-500 py-6">
          No active network policies.
        </div>
      )}

      {/* User-added policies (revocable) */}
      {userRules.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-500 mb-2">
            User-approved ({userRules.length})
          </h4>
          <div className="space-y-2">
            {userRules.map(([key, rule]) => (
              <div
                key={key}
                className="border border-emerald-500/20 bg-emerald-500/5 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sm font-medium text-zinc-200">
                        {rule.name || key}
                      </span>
                    </div>
                    <div className="ml-4 space-y-0.5">
                      {rule.endpoints?.map((ep, i) => (
                        <div key={i} className="text-xs text-zinc-400 flex items-center gap-2">
                          <span className="font-mono">{ep.host}:{ep.port}</span>
                          {ep.protocol && <span className="text-zinc-600">({ep.protocol})</span>}
                          {ep.tls === "terminate" && <span className="text-indigo-400/60 text-[10px]">TLS</span>}
                          {ep.rules && ep.rules.length > 0 && (
                            <span className="text-zinc-600 text-[10px]">
                              {ep.rules.map((r) => `${r.allow.method} ${r.allow.path}`).join(", ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {rule.binaries && rule.binaries.length > 0 && (
                      <div className="ml-4 mt-1 text-[10px] text-zinc-600">
                        Binaries: {rule.binaries.map((b) => b.path).join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {confirmRevoke === key ? (
                      <>
                        <span className="text-xs text-amber-400 self-center">
                          Remove permanently?
                        </span>
                        <button
                          onClick={() => handleRevoke(key)}
                          disabled={revoking === key}
                          className="px-3 py-1 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-600/30 disabled:opacity-50"
                        >
                          {revoking === key ? "Revoking..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmRevoke(null)}
                          className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmRevoke(key)}
                        className="px-3 py-1 text-xs bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-md hover:bg-orange-600/30"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {userRules.length === 0 && rules.length > 0 && (
        <div className="text-center text-sm text-zinc-500 py-4">
          No user-approved policies yet. Approve a draft recommendation or add one manually.
        </div>
      )}

      {/* System baseline policies (not revocable) */}
      {systemRules.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-zinc-600 mb-2">
            System baseline ({systemRules.length}) — required for sandbox operation
          </h4>
          <div className="space-y-1.5">
            {systemRules.map(([key, rule]) => (
              <div
                key={key}
                className="border border-zinc-700/30 bg-zinc-800/20 rounded-lg px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                  <span className="text-sm text-zinc-500">
                    {rule.name || key}
                  </span>
                  <span className="text-[10px] text-zinc-700 ml-1">
                    {rule.endpoints?.map((ep) => ep.host).join(", ")}
                  </span>
                  <span className="ml-auto text-[10px] text-zinc-700 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    locked
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
