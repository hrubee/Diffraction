"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { watchSandboxUrl, getSandboxLogs, type LogEntry } from "@/lib/api";

// Render structured fields as "key=value" pairs, matching TUI output.
function FieldSpans({ fields }: { fields: Record<string, string> }) {
  const pairs = Object.entries(fields).filter(([, v]) => v !== "");
  if (pairs.length === 0) return null;
  return (
    <span className="text-zinc-500 ml-1">
      {pairs.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && " "}
          <span className="text-zinc-600">{k}=</span>
          <span className="text-zinc-400">{v}</span>
        </span>
      ))}
    </span>
  );
}

const levelColor: Record<string, string> = {
  error: "text-red-400",
  warn: "text-amber-400",
  warning: "text-amber-400",
  info: "text-blue-400",
  debug: "text-zinc-500",
  trace: "text-zinc-600",
};

const sourceColor: Record<string, string> = {
  gateway: "text-violet-400",
  sandbox: "text-emerald-400",
};

export default function LogViewer({ sandboxName }: { sandboxName: string }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Track the timestamp of the most recent entry to avoid duplicates on stream start.
  const lastTsMs = useRef<number>(0);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);
    getSandboxLogs(sandboxName, 300)
      .then((data) => {
        setEntries(data.entries);
        if (data.entries.length > 0) {
          const last = data.entries[data.entries.length - 1];
          lastTsMs.current = last.timestamp
            ? new Date(last.timestamp).getTime()
            : 0;
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sandboxName]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!streaming) return;

    // Pass since_ms so the server only replays entries we haven't seen yet.
    const es = new EventSource(watchSandboxUrl(sandboxName, lastTsMs.current));

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          log_entry?: LogEntry;
          error?: string;
        };
        if (data.error) {
          setError(data.error);
          es.close();
          setStreaming(false);
          return;
        }
        if (data.log_entry) {
          const entry = data.log_entry;
          const entryTs = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
          // Update cursor so reconnects don't replay already-seen lines.
          if (entryTs > lastTsMs.current) lastTsMs.current = entryTs;
          setEntries((prev) => {
            // Cap buffer at 1000 to avoid unbounded growth.
            const next = prev.length >= 1000 ? prev.slice(-999) : prev;
            return [...next, entry];
          });
        }
      } catch {
        // malformed JSON — ignore
      }
    };

    es.onerror = () => {
      es.close();
      setStreaming(false);
    };

    return () => es.close();
  }, [sandboxName, streaming]);

  // Auto-scroll to bottom while streaming.
  useEffect(() => {
    if (streaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, streaming]);

  const filtered =
    filter === "all"
      ? entries
      : filter === "gateway" || filter === "sandbox"
        ? entries.filter((e) => (e.source || "gateway") === filter)
        : entries.filter((e) => e.level?.toLowerCase() === filter);

  return (
    <div className="flex flex-col h-[calc(100vh-280px)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setStreaming(!streaming)}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
            streaming
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
              : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
          }`}
        >
          {streaming ? "Streaming…" : "Stream"}
        </button>
        {!streaming && (
          <button
            onClick={fetchLogs}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            Refresh
          </button>
        )}
        {/* Level filters */}
        <div className="flex bg-zinc-800/50 rounded-md border border-zinc-700/50">
          {["all", "error", "warning", "info"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs capitalize transition-colors ${
                filter === f
                  ? "bg-zinc-700 text-white rounded-md"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {/* Source filters */}
        <div className="flex bg-zinc-800/50 rounded-md border border-zinc-700/50">
          {["gateway", "sandbox"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              className={`px-2.5 py-1 text-xs transition-colors ${
                filter === s
                  ? "bg-zinc-700 text-white rounded-md"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-zinc-600">
          {filtered.length} entries
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-2 px-3 py-2 rounded-md border border-destructive/50 bg-destructive/10 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Log output — matches TUI column order: time | source | level | message [fields] */}
      <div className="flex-1 overflow-auto bg-zinc-950 rounded-lg border border-zinc-800 p-3 font-mono text-xs leading-5">
        {loading && (
          <p className="text-zinc-500 animate-pulse">Loading logs…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-zinc-600">No log entries</p>
        )}
        {filtered.map((entry, i) => (
          <div key={i} className="flex gap-2 hover:bg-zinc-900/50 min-w-0">
            {/* Timestamp */}
            <span className="text-zinc-600 shrink-0 select-none w-[7ch]">
              {entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })
                : "--:--:--"}
            </span>
            {/* Source — "gateway" or "sandbox", matches TUI {source:<7} */}
            <span
              className={`shrink-0 w-[7ch] truncate ${sourceColor[(entry.source || "gateway")] ?? "text-zinc-500"}`}
            >
              {entry.source || "gateway"}
            </span>
            {/* Level */}
            <span
              className={`shrink-0 w-[5ch] uppercase ${levelColor[entry.level?.toLowerCase()] || "text-zinc-500"}`}
            >
              {entry.level || "-----"}
            </span>
            {/* Message + structured fields */}
            <span className="text-zinc-300 break-all min-w-0">
              {entry.message}
              {entry.fields && <FieldSpans fields={entry.fields} />}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
