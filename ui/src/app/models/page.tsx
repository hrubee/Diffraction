"use client";

import { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Model {
  id: string;
  name: string;
  provider: string;
  api: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
}

interface ProviderInfo {
  type: string;
  label: string;
  endpoint: string;
}

interface ModelRegistry {
  models: Model[];
  providers: Record<string, ProviderInfo>;
  defaults: { cloud: string; local: string };
}

interface ActiveModel {
  provider: string | null;
  model: string | null;
  available: boolean;
  raw?: string;
}

type SwitchStatus = "idle" | "loading" | "success" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Active model banner
// ---------------------------------------------------------------------------

interface ActiveModelBannerProps {
  active: ActiveModel | null;
  loading: boolean;
}

function ActiveModelBanner({ active, loading }: ActiveModelBannerProps) {
  if (loading) {
    return (
      <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-xl p-4 animate-pulse">
        <div className="h-3 bg-zinc-700/60 rounded w-24 mb-2" />
        <div className="h-5 bg-zinc-700/60 rounded w-48" />
      </div>
    );
  }

  if (!active || !active.available) {
    return (
      <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl px-4 py-3 text-xs text-zinc-500">
        Active inference model unavailable — openshell CLI not reachable.
      </div>
    );
  }

  return (
    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
        Active inference
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        {active.provider && (
          <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-xs rounded-lg font-medium">
            {active.provider}
          </span>
        )}
        {active.model && (
          <span className="text-sm text-zinc-200 font-mono">{active.model}</span>
        )}
        {!active.provider && !active.model && (
          <span className="text-sm text-zinc-500">Not configured</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch model panel
// ---------------------------------------------------------------------------

interface SwitchModelPanelProps {
  models: Model[];
  providers: Record<string, ProviderInfo>;
  onSwitch: (provider: string, model: string) => Promise<void>;
  status: SwitchStatus;
  statusMessage: string;
}

function SwitchModelPanel({
  models,
  providers,
  onSwitch,
  status,
  statusMessage,
}: SwitchModelPanelProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;

  const handleSet = useCallback(() => {
    if (!selectedModel) return;
    onSwitch(selectedModel.provider, selectedModel.id);
  }, [selectedModel, onSwitch]);

  // Group by provider for the select
  const byProvider: Record<string, Model[]> = {};
  for (const m of models) {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m);
  }

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-zinc-200">Switch Active Model</h2>
      <p className="text-xs text-zinc-500">
        Select a model and click Set Active. This calls{" "}
        <code className="bg-zinc-800 px-1 rounded">
          openshell inference set
        </code>{" "}
        on the host.
      </p>

      <div className="flex gap-2 items-center">
        <select
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          disabled={status === "loading" || models.length === 0}
          className="flex-1 bg-zinc-800 border border-zinc-700/60 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
          aria-label="Select model to activate"
        >
          <option value="">
            {models.length === 0 ? "No models loaded" : "Choose a model..."}
          </option>
          {Object.entries(byProvider).map(([provId, provModels]) => (
            <optgroup
              key={provId}
              label={providers[provId]?.label || provId}
            >
              {provModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({formatCtx(m.contextWindow)} ctx)
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <button
          onClick={handleSet}
          disabled={!selectedModelId || status === "loading"}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs rounded-lg transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          {status === "loading" ? "Switching..." : "Set Active"}
        </button>
      </div>

      {/* Status feedback */}
      {status === "success" && (
        <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {statusMessage}
        </div>
      )}
      {status === "error" && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ModelsPage() {
  const [registry, setRegistry] = useState<ModelRegistry | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);

  const [active, setActive] = useState<ActiveModel | null>(null);
  const [activeLoading, setActiveLoading] = useState(true);

  const [filter, setFilter] = useState<string>("all");

  const [switchStatus, setSwitchStatus] = useState<SwitchStatus>("idle");
  const [switchMessage, setSwitchMessage] = useState<string>("");

  // Fetch model registry
  useEffect(() => {
    fetch("/api/models")
      .then((r) => r.json())
      .then(setRegistry)
      .catch(() => {})
      .finally(() => setRegistryLoading(false));
  }, []);

  // Fetch active model
  const fetchActive = useCallback(() => {
    setActiveLoading(true);
    fetch("/api/models/active")
      .then((r) => r.json())
      .then(setActive)
      .catch(() => setActive({ provider: null, model: null, available: false }))
      .finally(() => setActiveLoading(false));
  }, []);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // Switch model handler
  const handleSwitch = useCallback(
    async (provider: string, model: string) => {
      setSwitchStatus("loading");
      setSwitchMessage("");

      try {
        const res = await fetch("/api/models/active", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, model }),
        });
        const body = await res.json();

        if (!res.ok) {
          setSwitchStatus("error");
          setSwitchMessage(body.error || "Switch failed");
          return;
        }

        setSwitchStatus("success");
        setSwitchMessage(
          `Switched to ${body.active?.model || model} via ${body.active?.provider || provider}`
        );

        // Refresh active display
        fetchActive();
      } catch {
        setSwitchStatus("error");
        setSwitchMessage("Network error — could not reach API");
      }
    },
    [fetchActive]
  );

  const models = registry?.models || [];
  const providers = registry?.providers || {};
  const defaults = registry?.defaults || { cloud: "", local: "" };

  const providerNames = ["all", ...Array.from(new Set(models.map((m) => m.provider)))];
  const filtered =
    filter === "all" ? models : models.filter((m) => m.provider === filter);

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Models</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Available inference models across providers
        </p>
      </div>

      {/* Active model */}
      <ActiveModelBanner active={active} loading={activeLoading} />

      {/* Switch panel */}
      <SwitchModelPanel
        models={models}
        providers={providers}
        onSwitch={handleSwitch}
        status={switchStatus}
        statusMessage={switchMessage}
      />

      {/* Default models pills */}
      {(defaults.cloud || defaults.local) && (
        <div className="flex flex-wrap gap-2">
          {defaults.cloud && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-2 text-sm">
              <span className="text-zinc-500">Cloud default:</span>{" "}
              <span className="text-indigo-400 font-medium">{defaults.cloud}</span>
            </div>
          )}
          {defaults.local && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-sm">
              <span className="text-zinc-500">Local default:</span>{" "}
              <span className="text-emerald-400 font-medium">{defaults.local}</span>
            </div>
          )}
        </div>
      )}

      {/* Provider filter */}
      {!registryLoading && models.length > 0 && (
        <div
          className="flex flex-wrap gap-1 bg-zinc-800/50 rounded-md border border-zinc-700/50 w-fit p-1"
          role="tablist"
          aria-label="Filter by provider"
        >
          {providerNames.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={filter === p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 text-xs capitalize transition-colors rounded ${
                filter === p
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {p === "all"
                ? `All (${models.length})`
                : `${providers[p]?.label || p} (${models.filter((m) => m.provider === p).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Model grid */}
      {registryLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-4 animate-pulse space-y-2"
            >
              <div className="h-4 bg-zinc-700/60 rounded w-2/3" />
              <div className="h-3 bg-zinc-700/40 rounded w-full font-mono" />
              <div className="flex gap-2 mt-3">
                <div className="h-5 bg-zinc-700/40 rounded w-16" />
                <div className="h-5 bg-zinc-700/40 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-10 text-center text-sm text-zinc-500">
          {models.length === 0
            ? "No models found. Check that cli/models.json exists."
            : `No models for provider "${filter}".`}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((model) => {
            const isCloudDefault = model.id === defaults.cloud;
            const isLocalDefault = model.id === defaults.local;
            const isActiveModel = active?.model === model.id;
            const isDefault = isCloudDefault || isLocalDefault;

            return (
              <div
                key={model.id}
                className={`bg-zinc-800/30 border rounded-xl p-4 transition-colors ${
                  isActiveModel
                    ? "border-indigo-500/50 bg-indigo-500/5"
                    : isDefault
                    ? "border-indigo-500/30"
                    : "border-zinc-700/50 hover:border-zinc-600/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-zinc-200 truncate">
                      {model.name}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                      {model.id}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {isActiveModel && (
                      <span className="px-1.5 py-0.5 bg-indigo-500/25 text-indigo-300 text-[10px] rounded border border-indigo-500/30">
                        active
                      </span>
                    )}
                    {isCloudDefault && !isActiveModel && (
                      <span className="px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 text-[10px] rounded">
                        cloud default
                      </span>
                    )}
                    {isLocalDefault && !isActiveModel && (
                      <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] rounded">
                        local default
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3 text-xs text-zinc-500">
                  <span className="px-1.5 py-0.5 bg-zinc-700/50 rounded">
                    {providers[model.provider]?.label || model.provider}
                  </span>
                  <span>ctx: {formatCtx(model.contextWindow)}</span>
                  <span>max: {formatCtx(model.maxTokens)}</span>
                  {model.reasoning && (
                    <span className="text-amber-400">reasoning</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
