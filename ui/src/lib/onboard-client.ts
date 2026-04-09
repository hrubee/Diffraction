// Onboard wizard API client + SSE handler

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export type Provider = "nvidia-nim" | "openai" | "anthropic" | "ollama" | "custom";

export interface OnboardInputs {
  provider: Provider;
  apiKey: string;
  model: string;
  sandboxName: string;
  policies: string[];
  endpointUrl?: string;
}

export interface StartOnboardResult {
  jobId: string;
}

export interface PolicyPreset {
  id: string;
  name: string;
  description: string;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

export interface ProviderTestResult {
  ok: boolean;
  error?: string;
}

export async function startOnboard(inputs: OnboardInputs): Promise<StartOnboardResult> {
  const res = await fetch(`${API_BASE}/api/onboard/start`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function testProviderKey(provider: Provider, apiKey: string, endpointUrl?: string): Promise<ProviderTestResult> {
  const res = await fetch(`${API_BASE}/api/onboard/test-provider`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey, endpointUrl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  return res.json();
}

export async function listModelsForProvider(provider: Provider): Promise<ModelOption[]> {
  const res = await fetch(`${API_BASE}/api/models?provider=${encodeURIComponent(provider)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  // api/routes/models.js returns { models: [...] } or array
  const models = Array.isArray(data) ? data : (data.models ?? []);
  return models.filter((m: ModelOption) => m.provider === provider || !provider);
}

export async function listPolicyPresets(): Promise<PolicyPreset[]> {
  const res = await fetch(`${API_BASE}/api/onboard/presets`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.presets ?? [];
}

export async function checkSandboxNameConflict(name: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/sandboxes`, { credentials: "include" });
  if (!res.ok) return false;
  const data = await res.json();
  const sandboxes: Array<{ name: string }> = data.sandboxes ?? [];
  return sandboxes.some((s) => s.name === name);
}

export type SseEvent =
  | { type: "job_state"; job: { status: string } }
  | { type: "step_event"; step: string; status: string; error?: string | null }
  | { type: "job_done"; status: string; exit_code: number | null; finished_at: number | null }
  | { type: "no_job"; sandbox: string };

export function subscribeJobEvents(
  sandboxName: string,
  onEvent: (evt: SseEvent) => void,
  onError: (err: string) => void,
): () => void {
  const url = `${API_BASE}/api/events?sandbox=${encodeURIComponent(sandboxName)}`;
  const es = new EventSource(url, { withCredentials: true });

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as SseEvent;
      onEvent(data);
      if (data.type === "job_done") {
        es.close();
      }
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = () => {
    onError("Connection lost during provisioning");
    es.close();
  };

  return () => es.close();
}
