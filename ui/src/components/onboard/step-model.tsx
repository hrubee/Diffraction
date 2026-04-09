"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Provider, ModelOption } from "@/lib/onboard-client";
import { listModelsForProvider } from "@/lib/onboard-client";

const DEFAULT_MODELS: Record<Provider, string> = {
  "nvidia-nim": "nvidia/nemotron-3-super-120b-a12b",
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20241022",
  ollama: "llama3.2",
  custom: "",
};

interface StepModelProps {
  provider: Provider;
  value: string;
  onChange: (model: string) => void;
}

export function StepModel({ provider, value, onChange }: StepModelProps) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [customModel, setCustomModel] = useState("");

  useEffect(() => {
    setLoading(true);
    listModelsForProvider(provider).then((list) => {
      setModels(list);
      if (!value && list.length > 0) {
        const def = list.find((m) => m.id === DEFAULT_MODELS[provider]) ?? list[0];
        onChange(def.id);
      } else if (!value) {
        onChange(DEFAULT_MODELS[provider] ?? "");
      }
      setLoading(false);
    });
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Select model</h2>
      <p className="text-sm text-zinc-400">
        Choose the model your sandbox will use for inference requests.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 size={14} className="animate-spin" /> Loading models…
        </div>
      ) : models.length > 0 ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">Model</label>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm focus:outline-none focus:border-zinc-500"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.id}
                {m.id === DEFAULT_MODELS[provider] ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">Model ID</label>
          <input
            type="text"
            value={customModel || value}
            onChange={(e) => { setCustomModel(e.target.value); onChange(e.target.value); }}
            placeholder={DEFAULT_MODELS[provider] || "Enter model ID"}
            className="w-full px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <p className="text-xs text-zinc-500">No models found in registry — enter model ID manually.</p>
        </div>
      )}
    </div>
  );
}
