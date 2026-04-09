"use client";

import type { Provider } from "@/lib/onboard-client";

interface ProviderCard {
  id: Provider;
  name: string;
  description: string;
  requiresKey: boolean;
}

const PROVIDERS: ProviderCard[] = [
  { id: "nvidia-nim", name: "NVIDIA NIM", description: "Cloud inference via NVIDIA NIM API. Recommended.", requiresKey: true },
  { id: "openai", name: "OpenAI", description: "GPT-4 and other OpenAI models via official API.", requiresKey: true },
  { id: "anthropic", name: "Anthropic", description: "Claude models via Anthropic API.", requiresKey: true },
  { id: "ollama", name: "Ollama (local)", description: "Run open models locally — no API key needed.", requiresKey: false },
  { id: "custom", name: "Custom endpoint", description: "Any OpenAI-compatible endpoint URL.", requiresKey: false },
];

interface StepProviderProps {
  value: Provider;
  onChange: (p: Provider) => void;
}

export function StepProvider({ value, onChange }: StepProviderProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Select inference provider</h2>
      <p className="text-sm text-zinc-400">Choose where your sandbox sends LLM requests.</p>
      <div className="grid grid-cols-1 gap-2 mt-4">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`flex items-start gap-4 text-left px-4 py-3 rounded-lg border transition-colors ${
              value === p.id
                ? "border-zinc-400 bg-zinc-800"
                : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
            }`}
          >
            <span
              className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                value === p.id ? "border-zinc-300 bg-zinc-300" : "border-zinc-600"
              }`}
            >
              {value === p.id && <span className="w-2 h-2 rounded-full bg-zinc-900" />}
            </span>
            <span>
              <span className="block font-medium text-sm text-zinc-100">{p.name}</span>
              <span className="block text-xs text-zinc-400 mt-0.5">{p.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
