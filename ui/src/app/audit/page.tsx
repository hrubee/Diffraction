"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getAuditLog, listSandboxes } from "@/lib/api";
import type { AuditEvent } from "@/lib/api";

// ---- Event type badge ----

const typeMeta: Record<string, { label: string; bg: string; text: string }> = {
  policy_update: {
    label: "Policy",
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
  },
  api_request: {
    label: "API",
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
  },
};

function TypeBadge({ type }: { type: string }) {
  const meta = typeMeta[type] ?? {
    label: type,
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.text}`}
    >
      {meta.label}
    </span>
  );
}

// ---- Status badge for API requests ----

function StatusChip({ status }: { status?: number }) {
  if (!status) return null;
  const ok = status >= 200 && status < 300;
  const warn = status >= 300 && status < 500;
  return (
    <span
      className={`text-xs font-mono ${
        ok
          ? "text-emerald-400"
          : warn
            ? "text-amber-400"
            : "text-red-400"
      }`}
    >
      {status}
    </span>
  );
}

// ---- Filter bar ----

interface FilterBarProps {
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  sandboxFilter: string;
  setSandboxFilter: (v: string) => void;
  sandboxNames: string[];
}

function FilterBar({
  typeFilter,
  setTypeFilter,
  sandboxFilter,
  setSandboxFilter,
  sandboxNames,
}: FilterBarProps) {
  const selectClass =
    "bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={typeFilter}
        onChange={(e) => setTypeFilter(e.target.value)}
        className={selectClass}
        aria-label="Filter by type"
      >
        <option value="">All Types</option>
        <option value="policy">Policy Updates</option>
        <option value="api_request">API Requests</option>
      </select>

      <select
        value={sandboxFilter}
        onChange={(e) => setSandboxFilter(e.target.value)}
        className={selectClass}
        aria-label="Filter by sandbox"
      >
        <option value="">All Sandboxes</option>
        {sandboxNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Event row ----

function EventRow({ event }: { event: AuditEvent }) {
  const time = event.timestamp
    ? new Date(event.timestamp).toLocaleString()
    : "---";

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
      <td className="p-3 text-xs text-zinc-500 whitespace-nowrap">{time}</td>
      <td className="p-3">
        <TypeBadge type={event.type} />
      </td>
      <td className="p-3 text-sm text-zinc-400">
        {event.sandbox ?? <span className="text-zinc-600">—</span>}
      </td>
      <td className="p-3 text-sm text-zinc-300">
        <span className="line-clamp-1">{event.details}</span>
      </td>
      <td className="p-3">
        <StatusChip status={event.status} />
      </td>
    </tr>
  );
}

// ---- Empty state ----

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <tr>
      <td colSpan={5}>
        <div className="py-12 text-center text-sm text-zinc-500">
          {filtered
            ? "No events match the current filters."
            : "No audit events recorded yet."}
        </div>
      </td>
    </tr>
  );
}

// ---- Page ----

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState("");
  const [sandboxFilter, setSandboxFilter] = useState("");
  const [sandboxNames, setSandboxNames] = useState<string[]>([]);

  // Track if we're refreshing vs. initial load to avoid flicker
  const isInitialLoad = useRef(true);

  // Load sandbox names for the filter dropdown
  useEffect(() => {
    listSandboxes()
      .then((d) => setSandboxNames(d.sandboxes.map((s) => s.name)))
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (isInitialLoad.current) setLoading(true);
      try {
        const data = await getAuditLog({
          sandbox: sandboxFilter || undefined,
          type: typeFilter || undefined,
          limit: PAGE_SIZE,
          offset: currentOffset,
        });
        setEvents((prev) => (append ? [...prev, ...data.events] : data.events));
        setTotal(data.total);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit log");
      } finally {
        setLoading(false);
        isInitialLoad.current = false;
      }
    },
    [sandboxFilter, typeFilter]
  );

  // Reset and reload when filters change
  useEffect(() => {
    isInitialLoad.current = true;
    setOffset(0);
    setEvents([]);
    load(0, false);
  }, [load]);

  // Auto-refresh every 10 seconds (non-appending, reset to page 1)
  useEffect(() => {
    const interval = setInterval(() => {
      // Only auto-refresh if user hasn't paginated beyond page 1
      if (offset === 0) {
        isInitialLoad.current = false;
        load(0, false);
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [load, offset]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    load(next, true);
  };

  const filtersActive = Boolean(typeFilter || sandboxFilter);
  const hasMore = events.length < total;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Policy updates and API activity
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <FilterBar
        typeFilter={typeFilter}
        setTypeFilter={(v) => { setTypeFilter(v); }}
        sandboxFilter={sandboxFilter}
        setSandboxFilter={(v) => { setSandboxFilter(v); }}
        sandboxNames={sandboxNames}
      />

      {/* Table */}
      <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-zinc-700/50 text-xs text-zinc-500 uppercase tracking-wider">
                <th className="text-left p-3 font-medium">Time</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Sandbox</th>
                <th className="text-left p-3 font-medium">Details</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && events.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="py-12 text-center text-sm text-zinc-500">
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <EmptyState filtered={filtersActive} />
              ) : (
                events.map((event, i) => (
                  <EventRow key={`${event.timestamp}-${i}`} event={event} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Load more + count */}
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          Showing {events.length} of {total} events
        </span>
        {hasMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            className="px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 border
                       border-zinc-700 text-zinc-300 text-sm transition-colors
                       focus:outline-none focus:ring-2 focus:ring-zinc-500/50"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
