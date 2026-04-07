"use client";

import { useState, useEffect } from "react";

export default function ChatPanel({ sandboxName }: { sandboxName: string }) {
  const [iframeKey, setIframeKey] = useState(0);
  // resolvedFor tracks which sandboxName the current token was fetched for.
  // tokenLoading is derived: true whenever resolvedFor !== sandboxName.
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [copied, setCopied] = useState(false);

  const tokenLoading = resolvedFor !== sandboxName;
  const baseChatUrl = `/sandboxes/${sandboxName}/diffract_chat/`;
  const chatUrl = token ? `${baseChatUrl}?token=${encodeURIComponent(token)}` : baseChatUrl;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gateway-token", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const t = data.token ?? null;
        setToken(t);
        setTokenError(!t);
        setResolvedFor(sandboxName);
      })
      .catch(() => {
        if (cancelled) return;
        setToken(null);
        setTokenError(true);
        setResolvedFor(sandboxName);
      });
    return () => { cancelled = true; };
  }, [sandboxName]);

  function copyToken() {
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-280px)]">
      {/* Controls bar */}
      <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
        <span className="text-zinc-500">
          Agent: <span className="text-zinc-300 font-medium">{sandboxName}</span>
        </span>

        {!tokenLoading && token && (
          <span className="flex items-center gap-1 text-zinc-500">
            <span>Token:</span>
            <code className="text-zinc-300 font-mono bg-zinc-800 px-1 rounded max-w-[120px] truncate">
              {token}
            </code>
            <button
              onClick={copyToken}
              className="text-indigo-400 hover:text-indigo-300"
              title="Copy gateway token"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </span>
        )}

        {!tokenLoading && tokenError && (
          <span className="flex items-center gap-1 text-red-400 bg-red-950/40 border border-red-700/50 px-2 py-0.5 rounded text-xs">
            Token fetch failed — chat may not load
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            className="text-amber-400 hover:text-amber-300"
            title="Reload chat — starts a fresh session (same as typing /new)"
          >
            New Session
          </button>
          <span className="text-zinc-700">|</span>
          <a
            href={chatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            Open in new tab
          </a>
        </div>
      </div>

      {/* OpenClaw UI iframe — blocked until token is resolved */}
      {tokenLoading ? (
        <div className="flex-1 w-full rounded-lg border border-zinc-700/50 bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">
          Loading…
        </div>
      ) : (
        <iframe
          key={iframeKey}
          src={chatUrl}
          className="flex-1 w-full rounded-lg border border-zinc-700/50 bg-zinc-950"
          allow="clipboard-write; clipboard-read"
        />
      )}
    </div>
  );
}
