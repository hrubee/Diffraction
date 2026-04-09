"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PolicyPreset } from "@/lib/onboard-client";
import { listPolicyPresets } from "@/lib/onboard-client";

const RECOMMENDED = new Set(["pypi", "npm"]);

interface StepPoliciesProps {
  selected: string[];
  onChange: (presets: string[]) => void;
}

export function StepPolicies({ selected, onChange }: StepPoliciesProps) {
  const [presets, setPresets] = useState<PolicyPreset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPolicyPresets().then((list) => {
      setPresets(list);
      // auto-select recommended if nothing selected yet
      if (selected.length === 0) {
        const recs = list.filter((p) => RECOMMENDED.has(p.id)).map((p) => p.id);
        if (recs.length > 0) onChange(recs);
      }
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Policy presets</h2>
      <p className="text-sm text-zinc-400">
        Allow your sandbox to reach specific external services. Pypi + npm recommended for most agents.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> Loading presets…
        </div>
      ) : (
        <div className="space-y-2">
          {presets.map((p) => (
            <label
              key={p.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                selected.includes(p.id)
                  ? "border-zinc-500 bg-zinc-800"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="mt-0.5 accent-zinc-300"
              />
              <span>
                <span className="block text-sm font-medium text-zinc-100">
                  {p.name}
                  {RECOMMENDED.has(p.id) && (
                    <span className="ml-2 text-xs text-emerald-400 font-normal">recommended</span>
                  )}
                </span>
                <span className="block text-xs text-zinc-400 mt-0.5">{p.description}</span>
              </span>
            </label>
          ))}
          {presets.length === 0 && (
            <p className="text-sm text-zinc-500">No presets found. You can add them later.</p>
          )}
        </div>
      )}
    </div>
  );
}
