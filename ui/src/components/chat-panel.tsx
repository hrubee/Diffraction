"use client";

import { useState } from "react";

export default function ChatPanel({ sandboxName }: { sandboxName: string }) {
  const [iframeKey, setIframeKey] = useState(0);

  const chatUrl = `/sandboxes/${sandboxName}/diffract_chat/`;

  return (
    <div className="flex flex-col h-[calc(100vh-280px)]">
      {/* Controls bar */}
      <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
        <span className="text-zinc-500">
          Agent: <span className="text-zinc-300 font-medium">{sandboxName}</span>
        </span>

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

      {/* OpenClaw UI iframe */}
      <iframe
        key={iframeKey}
        src={chatUrl}
        className="flex-1 w-full rounded-lg border border-zinc-700/50 bg-zinc-950"
        allow="clipboard-write; clipboard-read"
      />
    </div>
  );
}
