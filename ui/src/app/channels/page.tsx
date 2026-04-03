"use client";

import { useEffect, useState, useCallback } from "react";

// --- Types ---

type ChannelStatus = "running" | "stopped" | "error";

interface ChannelConfig {
  hasToken: boolean;
  allowedChatIds: string[];
}

interface Channel {
  type: string;
  status: ChannelStatus;
  sandbox: string | null;
  pid: number | null;
  config: ChannelConfig;
}

interface SandboxEntry {
  name: string;
}

interface ConfigFormState {
  token: string;
  sandbox: string;
  allowedChatIds: string;
}

// --- Channel metadata catalogue ---

interface ChannelMeta {
  type: string;
  label: string;
  description: string;
  available: boolean;
  iconPath: string;
  iconColor: string;
}

const CHANNEL_CATALOGUE: ChannelMeta[] = [
  {
    type: "telegram",
    label: "Telegram",
    description: "Forward messages between a Telegram bot and a sandbox agent.",
    available: true,
    iconPath:
      "M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z",
    iconColor: "text-sky-400",
  },
  {
    type: "discord",
    label: "Discord",
    description: "Connect a Discord bot to a sandbox agent.",
    available: false,
    iconPath:
      "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z",
    iconColor: "text-indigo-400",
  },
  {
    type: "slack",
    label: "Slack",
    description: "Bridge a Slack app to a sandbox agent.",
    available: false,
    iconPath:
      "M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zm-5 1.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5v-5C6.5 5.67 7.17 5 8 5s1.5.67 1.5 1.5v5zm5 3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5H14v1.5c0 .83-.67 1.5-1.5 1.5S11 19.33 11 18.5V17H9.5C8.67 17 8 16.33 8 15.5S8.67 14 9.5 14h5zm-8.5-2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S6 19.33 6 18.5v-5zm8.5-1H16c.83 0 1.5.67 1.5 1.5S16.83 14 16 14h-1.5v-1.5c0-.83.67-1.5 1.5-1.5z",
    iconColor: "text-emerald-400",
  },
];

// --- Status badge ---

function StatusBadge({ status }: { status: ChannelStatus | "coming-soon" }) {
  if (status === "coming-soon") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/50">
        Coming soon
      </span>
    );
  }
  const styles: Record<ChannelStatus, string> = {
    running:
      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    stopped:
      "bg-zinc-800 text-zinc-500 border-zinc-700/50",
    error:
      "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const dots: Record<ChannelStatus, string> = {
    running: "bg-emerald-400",
    stopped: "bg-zinc-600",
    error: "bg-red-400",
  };
  const labels: Record<ChannelStatus, string> = {
    running: "Running",
    stopped: "Stopped",
    error: "Error",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {labels[status]}
    </span>
  );
}

// --- Configure form (inline, collapsible) ---

function ConfigureForm({
  channel,
  sandboxes,
  onSave,
  onClose,
  saving,
}: {
  channel: Channel | null;
  sandboxes: SandboxEntry[];
  onSave: (form: ConfigFormState) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ConfigFormState>({
    token: "",
    sandbox: channel?.sandbox || (sandboxes[0]?.name ?? ""),
    allowedChatIds: channel?.config.allowedChatIds?.join(", ") ?? "",
  });

  const set = (key: keyof ConfigFormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="mt-4 pt-4 border-t border-zinc-700/50 space-y-3">
      {/* Bot token */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Bot token
        </label>
        {channel?.config.hasToken && form.token === "" ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 italic">configured</span>
            <button
              onClick={() => set("token", " ")}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              replace
            </button>
          </div>
        ) : (
          <input
            type="password"
            placeholder="Bot token from @BotFather"
            value={form.token.trim()}
            onChange={(e) => set("token", e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        )}
      </div>

      {/* Sandbox selector */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Sandbox
        </label>
        {sandboxes.length === 0 ? (
          <p className="text-xs text-zinc-500">No sandboxes found. Create one first.</p>
        ) : (
          <select
            value={form.sandbox}
            onChange={(e) => set("sandbox", e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            {sandboxes.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Allowed chat IDs */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Allowed chat IDs{" "}
          <span className="text-zinc-600 font-normal">(optional — comma-separated)</span>
        </label>
        <input
          type="text"
          placeholder="7871236037, 1234567890"
          value={form.allowedChatIds}
          onChange={(e) => set("allowedChatIds", e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <p className="text-[11px] text-zinc-600 mt-1">
          Leave empty to accept messages from any Telegram user.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Channel card ---

function ChannelCard({
  meta,
  channel,
  sandboxes,
  onStart,
  onStop,
  onSaveConfig,
}: {
  meta: ChannelMeta;
  channel: Channel | null;
  sandboxes: SandboxEntry[];
  onStart: (type: string, form: ConfigFormState) => Promise<void>;
  onStop: (type: string) => Promise<void>;
  onSaveConfig: (type: string, form: ConfigFormState) => Promise<void>;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const status = channel?.status ?? "stopped";
  const isRunning = status === "running";

  const handleToggle = async () => {
    setActionPending(true);
    setErrorMsg(null);
    try {
      if (isRunning) {
        await onStop(meta.type);
      } else {
        // Need config to start — open the form if not already open
        if (!channel?.config.hasToken) {
          setConfigOpen(true);
          setActionPending(false);
          return;
        }
        // Re-start with existing config: user must open form to supply token again
        setConfigOpen(true);
        setActionPending(false);
        return;
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    }
    setActionPending(false);
  };

  const handleSave = async (form: ConfigFormState) => {
    setSaving(true);
    setErrorMsg(null);
    try {
      if (isRunning) {
        // Config-only update — don't restart
        await onSaveConfig(meta.type, form);
      } else {
        // Start the bridge
        await onStart(meta.type, form);
      }
      setConfigOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
    }
    setSaving(false);
  };

  return (
    <div
      className={`bg-zinc-800/30 border rounded-lg p-4 transition-colors ${
        isRunning
          ? "border-emerald-500/20"
          : status === "error"
          ? "border-red-500/20"
          : "border-zinc-700/50"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 ${meta.iconColor}`}
        >
          <svg
            className="w-5 h-5"
            fill={meta.type === "telegram" ? "none" : "currentColor"}
            stroke={meta.type === "telegram" ? "currentColor" : "none"}
            strokeWidth={meta.type === "telegram" ? 2 : 0}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={meta.iconPath}
            />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100">
              {meta.label}
            </span>
            {meta.available ? (
              <StatusBadge status={status} />
            ) : (
              <StatusBadge status="coming-soon" />
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{meta.description}</p>

          {meta.available && channel?.sandbox && (
            <p className="text-xs text-zinc-600 mt-1">
              Sandbox:{" "}
              <span className="font-mono text-zinc-400">{channel.sandbox}</span>
              {channel.pid && (
                <span className="ml-2 text-zinc-700">PID {channel.pid}</span>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        {meta.available && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setConfigOpen((v) => !v);
                setErrorMsg(null);
              }}
              className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 rounded-md hover:border-zinc-600 hover:text-zinc-200 transition-colors"
            >
              Configure
            </button>
            <button
              onClick={handleToggle}
              disabled={actionPending}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isRunning
                  ? "border-red-500/30 bg-red-600/10 text-red-400 hover:bg-red-600/20"
                  : "border-indigo-500/30 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20"
              }`}
            >
              {actionPending ? "..." : isRunning ? "Stop" : "Start"}
            </button>
          </div>
        )}
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-md p-2.5 text-xs text-red-400 flex items-start gap-2">
          <svg
            className="w-3.5 h-3.5 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-red-600 hover:text-red-400"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Inline configure form */}
      {meta.available && configOpen && (
        <ConfigureForm
          channel={channel}
          sandboxes={sandboxes}
          onSave={handleSave}
          onClose={() => {
            setConfigOpen(false);
            setErrorMsg(null);
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

// --- Page ---

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sandboxes, setSandboxes] = useState<SandboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { channels: Channel[] } = await res.json();
      setChannels(data.channels);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSandboxes = useCallback(async () => {
    try {
      const res = await fetch("/api/sandboxes");
      if (!res.ok) return;
      const data: { sandboxes: SandboxEntry[] } = await res.json();
      setSandboxes(data.sandboxes);
    } catch {
      // non-fatal: sandbox list is optional for the form
    }
  }, []);

  useEffect(() => {
    loadChannels();
    loadSandboxes();
    const interval = setInterval(loadChannels, 5000);
    return () => clearInterval(interval);
  }, [loadChannels, loadSandboxes]);

  // Build a map of type → Channel for quick lookup
  const channelMap = new Map<string, Channel>(
    channels.map((c) => [c.type, c])
  );

  const handleStart = async (type: string, form: ConfigFormState) => {
    const allowedChatIds = form.allowedChatIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch(`/api/channels/${type}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandbox: form.sandbox,
        token: form.token.trim(),
        allowedChatIds,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadChannels();
  };

  const handleStop = async (type: string) => {
    const res = await fetch(`/api/channels/${type}/stop`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadChannels();
  };

  const handleSaveConfig = async (type: string, form: ConfigFormState) => {
    const allowedChatIds = form.allowedChatIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const body: Record<string, unknown> = {
      sandbox: form.sandbox,
      allowedChatIds,
    };
    // Only send token if the user actually typed one
    if (form.token.trim()) body.token = form.token.trim();

    const res = await fetch(`/api/channels/${type}/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    await loadChannels();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Channels</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Message bridges that forward traffic between external platforms and
          sandbox agents.
        </p>
      </div>

      {/* Fetch error banner */}
      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400 flex items-center gap-2">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {fetchError}
        </div>
      )}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 bg-zinc-800/30 border border-zinc-700/50 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {CHANNEL_CATALOGUE.map((meta) => (
            <ChannelCard
              key={meta.type}
              meta={meta}
              channel={channelMap.get(meta.type) ?? null}
              sandboxes={sandboxes}
              onStart={handleStart}
              onStop={handleStop}
              onSaveConfig={handleSaveConfig}
            />
          ))}
        </div>
      )}

      {/* Info note */}
      {!loading && (
        <p className="text-xs text-zinc-700">
          Channel bridges run on the host and are not restarted automatically
          after a VPS reboot. Status refreshes every 5 seconds.
        </p>
      )}
    </div>
  );
}
