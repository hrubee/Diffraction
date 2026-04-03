"use client";

import { useEffect, useRef, useState } from "react";
import { watchSandboxUrl, getSandboxLogs, type LogEntry } from "@/lib/api";

export default function LogViewer({ sandboxName }: { sandboxName: string }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    getSandboxLogs(sandboxName, 300)
      .then((data) => setEntries(data.entries))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sandboxName]);

  useEffect(() => {
    if (!streaming) return;
    const es = new EventSource(watchSandboxUrl(sandboxName));
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log_entry) {
          setEntries((prev) => [...prev.slice(-500), data.log_entry]);
        }
      } catch {}
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
    };
    return () => es.close();
  }, [sandboxName, streaming]);

  useEffect(() => {
    if (streaming) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, streaming]);

  const filtered =
    filter === "all"
      ? entries
      : entries.filter((e) => e.level?.toLowerCase() === filter);

  const levelColor: Record<string, string> = {
    error: "text-red-400",
    warn: "text-amber-400",
    warning: "text-amber-400",
    info: "text-blue-400",
    debug: "text-zinc-500",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)]">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setStreaming(!streaming)}
          className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
            streaming
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
              : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
          }`}
        >
          {streaming ? "Streaming..." : "Stream"}
        </button>
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
        <span className="ml-auto text-xs text-zinc-600">
          {filtered.length} entries
        </span>
      </div>
      <div className="flex-1 overflow-auto bg-zinc-950 rounded-lg border border-zinc-800 p-3 font-mono text-xs leading-5">
        {loading && (
          <p className="text-zinc-500 animate-pulse">Loading logs...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-zinc-600">No log entries</p>
        )}
        {filtered.map((entry, i) => (
          <div key={i} className="flex gap-2 hover:bg-zinc-900/50">
            <span className="text-zinc-600 shrink-0 select-none">
              {entry.timestamp
                ? new Date(entry.timestamp).toLocaleTimeString()
                : "--:--:--"}
            </span>
            <span
              className={`shrink-0 w-12 uppercase ${levelColor[entry.level?.toLowerCase()] || "text-zinc-500"}`}
            >
              {entry.level || "---"}
            </span>
            <span className="text-zinc-300 break-all">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
