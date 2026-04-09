"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Provider } from "@/lib/onboard-client";
import { testProviderKey } from "@/lib/onboard-client";

const PROVIDER_LABELS: Record<Provider, string> = {
  "nvidia-nim": "NVIDIA NIM",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
  custom: "Custom endpoint",
};

const KEY_REQUIRED: Set<Provider> = new Set(["nvidia-nim", "openai", "anthropic"]);

interface StepApiKeyProps {
  provider: Provider;
  apiKey: string;
  endpointUrl: string;
  onChange: (key: string) => void;
  onEndpointChange: (url: string) => void;
}

type TestState = "idle" | "testing" | "ok" | "fail";

export function StepApiKey({ provider, apiKey, endpointUrl, onChange, onEndpointChange }: StepApiKeyProps) {
  const [testState, setTestState] = useState<TestState>("idle");
  const [testError, setTestError] = useState<string>("");

  const needsKey = KEY_REQUIRED.has(provider);
  const needsEndpoint = provider === "ollama" || provider === "custom";

  async function handleTest() {
    setTestState("testing");
    setTestError("");
    try {
      const result = await testProviderKey(provider, apiKey, endpointUrl || undefined);
      if (result.ok) {
        setTestState("ok");
      } else {
        setTestState("fail");
        setTestError(result.error ?? "Key test failed");
      }
    } catch (err) {
      setTestState("fail");
      setTestError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Configure {PROVIDER_LABELS[provider]}</h2>

      {needsKey && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { onChange(e.target.value); setTestState("idle"); }}
            placeholder="Paste your API key here"
            className="w-full px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <p className="text-xs text-zinc-500">
            Stored server-side only. Never sent to the client after submission.
          </p>
        </div>
      )}

      {needsEndpoint && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-300">
            {provider === "ollama" ? "Ollama base URL" : "Endpoint URL"}
          </label>
          <input
            type="url"
            value={endpointUrl}
            onChange={(e) => { onEndpointChange(e.target.value); setTestState("idle"); }}
            placeholder={provider === "ollama" ? "http://localhost:11434" : "https://api.example.com/v1"}
            className="w-full px-3 py-2 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>
      )}

      {!needsKey && !needsEndpoint && (
        <p className="text-sm text-zinc-400">No API key required for this provider.</p>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testState === "testing" || (!apiKey && needsKey) || (!endpointUrl && needsEndpoint)}
        >
          {testState === "testing" ? (
            <Loader2 size={14} className="animate-spin mr-1" />
          ) : null}
          Test connection
        </Button>

        {testState === "ok" && (
          <span className="flex items-center gap-1 text-emerald-400 text-sm">
            <CheckCircle size={14} /> Connected
          </span>
        )}
        {testState === "fail" && (
          <span className="flex items-center gap-1 text-red-400 text-sm">
            <XCircle size={14} /> {testError}
          </span>
        )}
      </div>
    </div>
  );
}
