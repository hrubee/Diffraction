"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// --- Types ---

interface ZapierStatus {
  configured: boolean;
  toolCount: number | null;
}

interface ZapierTool {
  name: string;
  description: string;
  inputSchema?: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

interface ToolsResponse {
  tools: ZapierTool[];
  total: number;
  page: number;
  limit: number;
}

interface SyncResult {
  synced: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
}

// --- Utilities ---

/** Convert a raw Zapier tool name like "zapier_google_sheets_create_row" to "Google Sheets Create Row" */
function humanizeName(raw: string): string {
  return raw
    .replace(/^zapier_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Extract the app name (first two segments after zapier_) for grouping display */
function appName(raw: string): string {
  const parts = raw.replace(/^zapier_/, "").split("_");
  return parts.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// --- Sub-components ---

function StatusPill({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/50">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
      Not configured
    </span>
  );
}

function ToolCard({ tool }: { tool: ZapierTool }) {
  const title = humanizeName(tool.name);
  const app = appName(tool.name);
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const propEntries = Object.entries(props).slice(0, 4);

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 hover:border-zinc-600/50 transition-colors flex flex-col gap-2">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-400/70 mb-0.5">
          {app}
        </p>
        <h3 className="text-sm font-semibold text-zinc-100 leading-snug">{title}</h3>
      </div>
      {tool.description && (
        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
          {tool.description}
        </p>
      )}
      {propEntries.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {propEntries.map(([k]) => (
            <span
              key={k}
              className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                required.has(k)
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700/50"
              }`}
            >
              {k}
            </span>
          ))}
          {Object.keys(props).length > 4 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-600 border border-zinc-700/50">
              +{Object.keys(props).length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ToolSkeleton() {
  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 animate-pulse space-y-2">
      <div className="h-2.5 w-20 bg-zinc-700 rounded" />
      <div className="h-4 w-3/4 bg-zinc-700 rounded" />
      <div className="h-3 w-full bg-zinc-700/60 rounded" />
      <div className="h-3 w-2/3 bg-zinc-700/60 rounded" />
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 flex items-start gap-2">
      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-600 hover:text-red-400 text-xs">
          dismiss
        </button>
      )}
    </div>
  );
}

// --- Main page ---

export default function ConnectToolsPage() {
  // Zapier connection state
  const [status, setStatus] = useState<ZapierStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Key input form
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tools list
  const [tools, setTools] = useState<ZapierTool[]>([]);
  const [toolsTotal, setToolsTotal] = useState(0);
  const [toolsPage, setToolsPage] = useState(0);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const TOOLS_LIMIT = 50;

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Deletion
  const [removing, setRemoving] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // --- Data loaders ---

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/zapier");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ZapierStatus = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ configured: false, toolCount: 0 });
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadTools = useCallback(async (page: number) => {
    setToolsLoading(true);
    setToolsError(null);
    try {
      const res = await fetch(
        `/api/mcp/zapier/tools?page=${page}&limit=${TOOLS_LIMIT}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: ToolsResponse = await res.json();
      if (page === 0) {
        setTools(data.tools);
      } else {
        setTools((prev) => [...prev, ...data.tools]);
      }
      setToolsTotal(data.total);
      setToolsPage(page);
    } catch (err) {
      setToolsError(err instanceof Error ? err.message : "Failed to load tools");
    } finally {
      setToolsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Load tools when Zapier becomes configured
  useEffect(() => {
    if (status?.configured) {
      loadTools(0);
    } else {
      setTools([]);
      setToolsTotal(0);
    }
  }, [status?.configured, loadTools]);

  // --- Handlers ---

  const handleSaveKey = async () => {
    const key = apiKeyInput.trim();
    if (!key) {
      setSaveError("API key cannot be empty");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/mcp/zapier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setApiKeyInput("");
      setShowKeyInput(false);
      setStatusLoading(true);
      await loadStatus();
      // Refresh tools with new key
      await loadTools(0);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    if (!confirm("Remove the Zapier MCP API key? This will disconnect all integrations.")) return;
    setRemoving(true);
    try {
      await fetch("/api/mcp/zapier", { method: "DELETE" });
      setStatus({ configured: false, toolCount: 0 });
      setTools([]);
      setToolsTotal(0);
    } catch {
      // non-fatal
    } finally {
      setRemoving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/mcp/zapier/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSyncResult(data as SyncResult);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleLoadMore = () => {
    loadTools(toolsPage + 1);
  };

  // --- Derived state ---

  const filteredTools = search.trim()
    ? tools.filter(
        (t) =>
          t.name.includes(search.toLowerCase().replace(/\s+/g, "_")) ||
          humanizeName(t.name).toLowerCase().includes(search.toLowerCase()) ||
          t.description?.toLowerCase().includes(search.toLowerCase())
      )
    : tools;

  const hasMore = tools.length < toolsTotal;

  return (
    <div className="p-6 space-y-8 max-w-6xl">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Connect Tools</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Connect external tool platforms to your sandbox agents via the Model Context Protocol.
        </p>
      </div>

      {/* ── Section 1: Zapier MCP Connection ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          {/* Zapier lightning bolt wordmark icon */}
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Zapier MCP</h2>
            <p className="text-xs text-zinc-500">
              8,000+ app integrations — Google Sheets, Slack, Instagram, Jira, and more.
            </p>
          </div>
        </div>

        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-5 space-y-4">
          {/* Status row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {statusLoading ? (
                <div className="h-5 w-24 bg-zinc-700 rounded-full animate-pulse" />
              ) : (
                <StatusPill configured={status?.configured ?? false} />
              )}
              {status?.configured && status.toolCount != null && (
                <span className="text-xs text-zinc-500">
                  {status.toolCount.toLocaleString()} tools available
                </span>
              )}
            </div>
            {status?.configured && !statusLoading && (
              <button
                onClick={handleRemoveKey}
                disabled={removing}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                {removing ? "Removing..." : "Remove key"}
              </button>
            )}
          </div>

          {/* API key input */}
          {!status?.configured || showKeyInput ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Zapier MCP API key
                </label>
                <input
                  type="password"
                  placeholder="Paste your Zapier MCP API key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                  className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="text-[11px] text-zinc-600 mt-1.5">
                  Find your key at{" "}
                  <a
                    href="https://actions.zapier.com/settings/mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    actions.zapier.com/settings/mcp
                  </a>
                  . Stored in{" "}
                  <span className="font-mono text-zinc-500">~/.diffract/credentials.json</span>{" "}
                  (mode 0600).
                </p>
              </div>

              {saveError && (
                <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveKey}
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? "Saving..." : "Save & Connect"}
                </button>
                {showKeyInput && (
                  <button
                    onClick={() => {
                      setShowKeyInput(false);
                      setApiKeyInput("");
                      setSaveError(null);
                    }}
                    className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="font-mono text-zinc-500">••••••••••••••••</span>
                <span className="text-xs text-zinc-600 italic">configured</span>
              </div>
              <button
                onClick={() => setShowKeyInput(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                replace
              </button>
            </div>
          )}

          {/* Sync to sandboxes */}
          {status?.configured && (
            <div className="pt-1 border-t border-zinc-700/50 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-medium text-zinc-300">Sync to sandboxes</p>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    Push the MCP server config to all running sandboxes so agents can use it.
                  </p>
                </div>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-4 py-2 text-sm border border-zinc-600 text-zinc-300 rounded-md hover:border-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {syncing ? "Syncing..." : "Sync to All Sandboxes"}
                </button>
              </div>

              {syncError && (
                <ErrorBanner message={syncError} onDismiss={() => setSyncError(null)} />
              )}

              {syncResult && (
                <div className="bg-zinc-900 border border-zinc-700/50 rounded-md p-3 text-xs space-y-1">
                  {syncResult.synced.length > 0 && (
                    <p className="text-emerald-400">
                      Synced to:{" "}
                      <span className="font-mono">{syncResult.synced.join(", ")}</span>
                    </p>
                  )}
                  {syncResult.synced.length === 0 && syncResult.errors.length === 0 && (
                    <p className="text-zinc-500">No sandboxes found to sync.</p>
                  )}
                  {syncResult.errors.map((e) => (
                    <p key={e.name} className="text-red-400">
                      <span className="font-mono">{e.name}</span>: {e.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 2: Connected Tools ── */}
      {status?.configured && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Connected Tools</h2>
              {toolsTotal > 0 && (
                <p className="text-xs text-zinc-500 mt-0.5">
                  Showing {tools.length} of {toolsTotal.toLocaleString()} tools
                </p>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
                />
              </svg>
              <input
                ref={searchRef}
                type="text"
                placeholder="Filter tools..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors w-56"
              />
            </div>
          </div>

          {/* Error state */}
          {toolsError && !toolsLoading && (
            <ErrorBanner message={toolsError} onDismiss={() => setToolsError(null)} />
          )}

          {/* Loading skeleton — first load */}
          {toolsLoading && tools.length === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <ToolSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Empty state after search */}
          {!toolsLoading && filteredTools.length === 0 && tools.length > 0 && (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No tools match &ldquo;{search}&rdquo;
            </div>
          )}

          {/* Tool grid */}
          {filteredTools.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredTools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          )}

          {/* Load more (only when no active search filter) */}
          {hasMore && !search && (
            <div className="flex justify-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={toolsLoading}
                className="px-6 py-2 text-sm border border-zinc-700 text-zinc-400 rounded-md hover:border-zinc-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {toolsLoading ? "Loading..." : `Load more (${(toolsTotal - tools.length).toLocaleString()} remaining)`}
              </button>
            </div>
          )}

          {/* Loading indicator for subsequent pages */}
          {toolsLoading && tools.length > 0 && (
            <div className="flex justify-center pt-2">
              <span className="text-xs text-zinc-600 animate-pulse">Loading more tools...</span>
            </div>
          )}
        </section>
      )}

      {/* ── Section 3: Other MCP Servers ── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Other MCP Servers</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Connect any MCP-compatible server to extend agent capabilities.
          </p>
        </div>

        <div className="bg-zinc-800/20 border border-zinc-700/50 border-dashed rounded-lg p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-zinc-800/60 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-400">Custom MCP Server</p>
            <p className="text-xs text-zinc-600 mt-0.5">
              Coming soon — connect any MCP-compatible endpoint via SSE or stdio transport.
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/50">
            Coming soon
          </span>
        </div>
      </section>
    </div>
  );
}
