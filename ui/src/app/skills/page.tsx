"use client";

import { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Preset {
  name: string;
  description: string;
  endpoints: string[];
  policyKeys: string[];
  category: string;
}

interface Sandbox {
  id: string;
  name: string;
}

interface ApplyState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
}

// ---------------------------------------------------------------------------
// Category badge colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  messaging: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  development: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  ai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  productivity: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  social: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  other: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20",
};

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-zinc-700/60 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-zinc-700/60 rounded w-2/3" />
          <div className="h-3 bg-zinc-700/40 rounded w-full" />
          <div className="h-3 bg-zinc-700/40 rounded w-4/5" />
        </div>
      </div>
      <div className="mt-4 h-8 bg-zinc-700/40 rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset card
// ---------------------------------------------------------------------------

interface PresetCardProps {
  preset: Preset;
  sandboxes: Sandbox[];
  sandboxesLoading: boolean;
}

function PresetCard({ preset, sandboxes, sandboxesLoading }: PresetCardProps) {
  const [selectedSandbox, setSelectedSandbox] = useState<string>("");
  const [applyState, setApplyState] = useState<ApplyState>({
    status: "idle",
    message: "",
  });

  const handleApply = useCallback(async () => {
    if (!selectedSandbox) return;
    setApplyState({ status: "loading", message: "" });

    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(preset.name)}/apply/${encodeURIComponent(selectedSandbox)}`,
        { method: "POST" }
      );
      const body = await res.json();

      if (!res.ok) {
        setApplyState({ status: "error", message: body.error || "Apply failed" });
        return;
      }

      const added = (body.rules_added || []).join(", ");
      setApplyState({
        status: "success",
        message: `Applied to ${selectedSandbox}${added ? ` (rules: ${added})` : ""}`,
      });
    } catch {
      setApplyState({ status: "error", message: "Network error — could not reach API" });
    }
  }, [preset.name, selectedSandbox]);

  const initials = preset.name.slice(0, 2).toUpperCase();
  const categoryColor = CATEGORY_COLORS[preset.category] || CATEGORY_COLORS.other;

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-4 flex flex-col gap-3 hover:border-zinc-600/70 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-zinc-700/60 rounded-lg flex items-center justify-center text-xs font-bold text-zinc-300 flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-zinc-200 capitalize">
              {preset.name}
            </span>
            <span
              className={`px-1.5 py-0.5 text-[10px] rounded border ${categoryColor}`}
            >
              {preset.category}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
            {preset.description || "No description available"}
          </p>
        </div>
      </div>

      {/* Endpoint summary */}
      {preset.endpoints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {preset.endpoints.slice(0, 3).map((ep) => (
            <span
              key={ep}
              className="px-1.5 py-0.5 bg-zinc-700/40 rounded text-[10px] font-mono text-zinc-400"
            >
              {ep}
            </span>
          ))}
          {preset.endpoints.length > 3 && (
            <span className="px-1.5 py-0.5 bg-zinc-700/40 rounded text-[10px] text-zinc-500">
              +{preset.endpoints.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Apply section */}
      <div className="border-t border-zinc-700/40 pt-3 space-y-2">
        {applyState.status === "success" ? (
          <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            {applyState.message}
          </div>
        ) : applyState.status === "error" ? (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {applyState.message}
          </div>
        ) : null}

        <div className="flex gap-2">
          <select
            value={selectedSandbox}
            onChange={(e) => {
              setSelectedSandbox(e.target.value);
              if (applyState.status !== "idle") {
                setApplyState({ status: "idle", message: "" });
              }
            }}
            disabled={sandboxesLoading || applyState.status === "loading"}
            className="flex-1 bg-zinc-800 border border-zinc-700/60 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
            aria-label={`Select sandbox to apply ${preset.name} preset`}
          >
            <option value="">
              {sandboxesLoading ? "Loading sandboxes..." : "Select sandbox..."}
            </option>
            {sandboxes.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleApply}
            disabled={
              !selectedSandbox ||
              applyState.status === "loading" ||
              sandboxesLoading
            }
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-xs rounded-lg transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            aria-label={`Apply ${preset.name} preset to selected sandbox`}
          >
            {applyState.status === "loading" ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SkillsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [sandboxesLoading, setSandboxesLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Fetch presets
  useEffect(() => {
    fetch("/api/skills", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setPresets(data.presets || []);
      })
      .catch((err) => {
        setPresetsError(err.message || "Failed to load presets");
      })
      .finally(() => setPresetsLoading(false));
  }, []);

  // Fetch sandboxes (for the apply dropdown)
  useEffect(() => {
    fetch("/api/sandboxes", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setSandboxes(data.sandboxes || []);
      })
      .catch(() => {
        setSandboxes([]);
      })
      .finally(() => setSandboxesLoading(false));
  }, []);

  // Derived data
  const categories = ["all", ...Array.from(new Set(presets.map((p) => p.category))).sort()];
  const filtered =
    categoryFilter === "all"
      ? presets
      : presets.filter((p) => p.category === categoryFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Skills & Presets</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Network policy presets for common services. Apply to a sandbox to grant
          outbound access.
        </p>
      </div>

      {/* Category filter tabs */}
      {!presetsLoading && presets.length > 0 && (
        <div
          className="flex flex-wrap gap-1 bg-zinc-800/50 rounded-md border border-zinc-700/50 w-fit p-1"
          role="tablist"
          aria-label="Filter by category"
        >
          {categories.map((cat) => {
            const count =
              cat === "all"
                ? presets.length
                : presets.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs capitalize transition-colors rounded ${
                  categoryFilter === cat
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                {cat === "all" ? `All (${count})` : `${cat} (${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* Preset grid */}
      {presetsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : presetsError ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-sm text-red-400 font-medium">
            Failed to load presets
          </p>
          <p className="text-xs text-red-400/70 mt-1">{presetsError}</p>
          <p className="text-xs text-zinc-500 mt-2">
            Check that the API server is running and the presets directory exists
            at <code className="bg-zinc-800 px-1 rounded">policies/presets/</code>
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-10 text-center">
          <p className="text-sm text-zinc-400">
            {categoryFilter === "all"
              ? "No policy presets found."
              : `No presets in the "${categoryFilter}" category.`}
          </p>
          {categoryFilter !== "all" && (
            <button
              onClick={() => setCategoryFilter("all")}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300"
            >
              Show all presets
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((preset) => (
            <PresetCard
              key={preset.name}
              preset={preset}
              sandboxes={sandboxes}
              sandboxesLoading={sandboxesLoading}
            />
          ))}
        </div>
      )}

      {/* Sandbox unavailable notice */}
      {!sandboxesLoading && sandboxes.length === 0 && !presetsLoading && presets.length > 0 && (
        <p className="text-xs text-zinc-600 text-center">
          No sandboxes found — start a sandbox first to apply presets.
        </p>
      )}
    </div>
  );
}
