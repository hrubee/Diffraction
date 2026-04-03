"use client";

import { useEffect, useState } from "react";

export default function ChatPanel({ sandboxName }: { sandboxName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    // Fetch token and gateway route in parallel
    Promise.all([
      fetch("/api/gateway-token")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/gateway-routes/${encodeURIComponent(sandboxName)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([tokenData, routeData]) => {
      if (tokenData?.token) setToken(tokenData.token);
      if (routeData?.url) setGatewayUrl(routeData.url);
      setLoading(false);
    });
  }, [sandboxName]);

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)]">
      {/* Token + controls bar */}
      <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
        <span className="text-zinc-500">
          Agent: <span className="text-zinc-300 font-medium">{sandboxName}</span>
        </span>

        {token && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-zinc-600">Token:</span>
            <code className="bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-mono text-[11px]">
              {token}
            </code>
            <button
              onClick={copyToken}
              className="text-indigo-400 hover:text-indigo-300"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <span className="text-zinc-700">|</span>
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="text-amber-400 hover:text-amber-300"
              title="Reload chat — starts a fresh session (same as typing /new)"
            >
              New Session
            </button>
            {gatewayUrl && (
              <>
                <span className="text-zinc-700">|</span>
                <a
                  href={gatewayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300"
                >
                  Open in new tab
                </a>
              </>
            )}
          </div>
        )}

        {!token && !loading && (
          <span className="ml-auto text-amber-400">
            Token unavailable — restart services
          </span>
        )}
      </div>

      {/* OpenClaw UI iframe — uses /__openclaw/ for API compatibility */}
      {gatewayUrl ? (
        <iframe
          key={iframeKey}
          src="/__openclaw/"
          className="flex-1 w-full rounded-lg border border-zinc-700/50 bg-zinc-950"
          allow="clipboard-write; clipboard-read"
        />
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          Connecting to sandbox gateway...
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-amber-400 text-sm">
          No gateway route for {sandboxName}. Run: diffract {sandboxName} connect
        </div>
      )}

      {token && (
        <p className="mt-2 text-[10px] text-zinc-600 text-center">
          Paste the token when the login screen appears. Click Copy to copy it to your clipboard.
        </p>
      )}
    </div>
  );
}
