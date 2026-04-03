"use client";

import { useState } from "react";
import {
  approveDraftChunk,
  rejectDraftChunk,
  approveAllDraftChunks,
  undoDraftChunk,
  revokeNetworkPolicy,
} from "@/lib/api";
import type { DraftChunk } from "@/lib/api";

export default function DraftPolicyPanel({
  sandboxName,
  chunks,
}: {
  sandboxName: string;
  chunks: DraftChunk[];
}) {
  const [acting, setActing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const pending = chunks.filter((c) => c.status === "pending");
  const approved = chunks.filter((c) => c.status === "approved");
  const rejected = chunks.filter((c) => c.status === "rejected");

  const handleApprove = async (chunkId: string) => {
    setActing(chunkId);
    try {
      const result = await approveDraftChunk(sandboxName, chunkId);
      setMessage(`Approved. Policy updated to v${result.policy_version}. If the agent already failed on this endpoint, type /new in chat to retry.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
    setActing(null);
  };

  const handleReject = async (chunkId: string) => {
    setActing(chunkId);
    try {
      await rejectDraftChunk(sandboxName, chunkId);
      setMessage("Rejected");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
    setActing(null);
  };

  const handleApproveAll = async () => {
    setActing("all");
    try {
      const result = await approveAllDraftChunks(sandboxName);
      setMessage(
        `Approved ${result.chunks_approved} chunks. Policy v${result.policy_version}`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
    setActing(null);
  };

  const handleRevoke = async (chunkId: string, ruleName: string) => {
    setActing(chunkId);
    try {
      // 1. Undo the draft chunk status
      await undoDraftChunk(sandboxName, chunkId);
      // 2. Remove the rule from the active policy
      const result = await revokeNetworkPolicy(sandboxName, ruleName).catch(
        () => null
      );
      setMessage(
        result
          ? `Revoked "${ruleName}". Policy updated to v${result.version}`
          : `Draft undone. Active policy rule "${ruleName}" may need manual removal.`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
    }
    setActing(null);
  };

  const statusStyle: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/5",
    approved: "border-emerald-500/30 bg-emerald-500/5",
    rejected: "border-red-500/30 bg-red-500/5",
  };

  const statusDot: Record<string, string> = {
    pending: "bg-amber-400",
    approved: "bg-emerald-400",
    rejected: "bg-red-400",
  };

  const renderChunk = (chunk: DraftChunk) => (
    <div
      key={chunk.id}
      className={`border rounded-lg p-4 ${statusStyle[chunk.status] || "border-zinc-700"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-2 h-2 rounded-full ${statusDot[chunk.status] || "bg-zinc-500"}`}
            />
            <span className="text-sm font-medium text-zinc-200">
              {chunk.rule_name || "Unnamed rule"}
            </span>
          </div>
          {chunk.proposed_rule?.endpoints?.map((ep, i) => (
            <div key={i} className="text-xs text-zinc-400 ml-4">
              {ep.host}:{ep.port}
            </div>
          ))}
          {chunk.binary && (
            <div className="text-xs text-zinc-500 ml-4 mt-1">
              Binary: {chunk.binary}
            </div>
          )}
          {chunk.rationale && (
            <div className="text-xs text-zinc-500 ml-4 mt-1">
              {chunk.rationale}
            </div>
          )}
          {chunk.security_notes && (
            <div className="text-xs text-amber-400/80 ml-4 mt-1">
              {chunk.security_notes}
            </div>
          )}
        </div>

        {chunk.status === "pending" && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleApprove(chunk.id)}
              disabled={acting === chunk.id}
              className="px-3 py-1 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-600/30 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => handleReject(chunk.id)}
              disabled={acting === chunk.id}
              className="px-3 py-1 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-600/30 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        )}

        {chunk.status === "approved" && (
          <div className="flex gap-2 shrink-0">
            {confirmRevoke === chunk.id ? (
              <>
                <span className="text-xs text-amber-400 self-center">
                  Remove from active policy?
                </span>
                <button
                  onClick={() => handleRevoke(chunk.id, chunk.rule_name)}
                  disabled={acting === chunk.id}
                  className="px-3 py-1 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-600/30 disabled:opacity-50"
                >
                  {acting === chunk.id ? "Revoking..." : "Confirm"}
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
                onClick={() => setConfirmRevoke(chunk.id)}
                className="px-3 py-1 text-xs bg-orange-600/20 text-orange-400 border border-orange-500/30 rounded-md hover:bg-orange-600/30"
              >
                Revoke
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
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

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-amber-400">
              Pending ({pending.length})
            </h3>
            <button
              onClick={handleApproveAll}
              disabled={acting === "all"}
              className="px-3 py-1 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-600/30 disabled:opacity-50"
            >
              Approve all
            </button>
          </div>
          <div className="space-y-2">{pending.map(renderChunk)}</div>
        </div>
      )}

      {pending.length === 0 && approved.length === 0 && rejected.length === 0 && (
        <div className="text-center text-sm text-zinc-500 py-8">
          No draft policy rules. Rules appear here when the agent tries to reach
          a blocked endpoint.
        </div>
      )}

      {/* Approved */}
      {approved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-emerald-400 mb-2">
            Approved ({approved.length})
          </h3>
          <div className="space-y-2">{approved.map(renderChunk)}</div>
        </div>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-400 mb-2">
            Rejected ({rejected.length})
          </h3>
          <div className="space-y-2">{rejected.map(renderChunk)}</div>
        </div>
      )}
    </div>
  );
}
