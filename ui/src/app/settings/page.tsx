"use client";

import { useEffect, useState } from "react";

interface GatewayConfig {
  settings?: Record<string, string>;
  [key: string]: unknown;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config/gateway")
      .then((r) => r.json())
      .then(setConfig)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = async (key: string, value: string) => {
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global: true,
          settings: { [key]: value },
        }),
      });
      // Refresh
      const r = await fetch("/api/config/gateway");
      setConfig(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gateway-global configuration
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-zinc-500">Loading...</div>
      ) : (
        <div className="space-y-4">
          {/* Gateway info */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Gateway Configuration
            </h2>
            {config ? (
              <div className="space-y-2">
                {Object.entries(config).map(([key, value]) => {
                  if (
                    key === "settings" ||
                    typeof value === "object" ||
                    value === null
                  )
                    return null;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0"
                    >
                      <span className="text-sm text-zinc-400 font-mono">
                        {key}
                      </span>
                      <span className="text-sm text-zinc-200">{String(value)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                No gateway configuration available
              </p>
            )}
          </div>

          {/* Settings key-value pairs */}
          {config?.settings &&
            Object.keys(config.settings).length > 0 && (
              <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Runtime Settings
                </h2>
                <div className="space-y-2">
                  {Object.entries(config.settings).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0"
                    >
                      <span className="text-sm text-zinc-400 font-mono">
                        {key}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-200">{value}</span>
                        <button
                          onClick={() => {
                            const newVal = prompt(`Edit "${key}":`, value);
                            if (newVal !== null) handleUpdate(key, newVal);
                          }}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* API Token */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              API Token
            </h2>
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">
                Used to authenticate with the dashboard. Share this with authorized users.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/auth/token");
                      if (r.ok) {
                        const data = await r.json();
                        navigator.clipboard.writeText(data.token);
                        alert("Token copied to clipboard");
                      }
                    } catch {}
                  }}
                  className="px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md text-zinc-300 transition-colors"
                >
                  Copy Token
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Generate a new API token? All existing sessions will be invalidated.")) return;
                    try {
                      await fetch("/api/auth/logout", { method: "POST" });
                      window.location.href = "/login";
                    } catch {}
                  }}
                  className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-500/30 rounded-md hover:bg-red-600/30 transition-colors"
                >
                  Rotate Token
                </button>
              </div>
            </div>
          </div>

          {/* Connection info */}
          <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Connection
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-zinc-800/50">
                <span className="text-zinc-400">gRPC Gateway</span>
                <span className="text-zinc-200 font-mono">
                  127.0.0.1:8080 (mTLS)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800/50">
                <span className="text-zinc-400">OpenClaw Gateway</span>
                <span className="text-zinc-200 font-mono">
                  127.0.0.1:18789 (WebSocket)
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-zinc-400">API Bridge</span>
                <span className="text-zinc-200 font-mono">
                  127.0.0.1:3001 (HTTP)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
