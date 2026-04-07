// Typed API client for the Diffract REST bridge

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Health
export async function getHealth() {
  return request<{ status: string; version: string }>("/api/health");
}

// Sandboxes
export interface Sandbox {
  id: string;
  name: string;
  namespace: string;
  phase: string;
  created_at_ms: string;
  current_policy_version: number;
  spec?: Record<string, unknown>;
  status?: {
    sandbox_name: string;
    conditions: Array<{
      type: string;
      status: string;
      reason: string;
      message: string;
    }>;
  };
}

export async function listSandboxes() {
  return request<{ sandboxes: Sandbox[] }>("/api/sandboxes");
}

export async function getSandbox(name: string) {
  return request<Sandbox>(`/api/sandboxes/${encodeURIComponent(name)}`);
}

export async function deleteSandbox(name: string) {
  return request<{ deleted: boolean }>(
    `/api/sandboxes/${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
}

export async function createSandbox(
  name: string,
  spec?: Record<string, unknown>
) {
  return request<Sandbox>("/api/sandboxes", {
    method: "POST",
    body: JSON.stringify({ name, spec: spec || {} }),
  });
}

// Providers
export interface Provider {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
}

export async function listProviders() {
  return request<{ providers: Provider[] }>("/api/providers");
}

// Logs
export interface LogEntry {
  timestamp: string;
  message: string;
  source: string;
  /** Rust module path shown in TUI detail view (e.g. "diffract_gateway::proxy") */
  target: string;
  level: string;
  /** Structured key-value fields from the tracing event (e.g. dst_host, action) */
  fields: Record<string, string>;
}

export async function getSandboxLogs(
  name: string,
  lines = 200,
  sinceMs = 0,
) {
  const qs = new URLSearchParams({ lines: String(lines) });
  if (sinceMs > 0) qs.set("since_ms", String(sinceMs));
  return request<{ entries: LogEntry[]; buffer_total: number }>(
    `/api/sandboxes/${encodeURIComponent(name)}/logs?${qs.toString()}`
  );
}

// SSE stream URL (consumed directly by EventSource).
// Pass sincems to replay only entries newer than the last fetched timestamp.
export function watchSandboxUrl(name: string, sinceMs = 0) {
  const qs = sinceMs > 0 ? `?since_ms=${sinceMs}` : "";
  return `${API_BASE}/api/sandboxes/${encodeURIComponent(name)}/watch${qs}`;
}

// Active policy (permanent network rules)
export interface NetworkEndpoint {
  host: string;
  port: number;
  protocol?: string;
  tls?: string;
  enforcement?: string;
  rules?: Array<{ allow: { method: string; path: string } }>;
}

export interface NetworkPolicyRule {
  name: string;
  endpoints: NetworkEndpoint[];
  binaries?: Array<{ path: string }>;
}

export interface ActivePolicy {
  version: number;
  policy_hash: string;
  network_policies: Record<string, NetworkPolicyRule>;
  baseline_rules: string[];
}

export async function getActivePolicy(sandboxName: string) {
  return request<ActivePolicy>(
    `/api/sandboxes/${encodeURIComponent(sandboxName)}/active-policy`
  );
}

export async function revokeNetworkPolicy(
  sandboxName: string,
  ruleName: string
) {
  return request<{ version: number; policy_hash: string; revoked: string }>(
    `/api/sandboxes/${encodeURIComponent(sandboxName)}/active-policy/${encodeURIComponent(ruleName)}`,
    { method: "DELETE" }
  );
}

// Draft policy
export interface DraftChunk {
  id: string;
  status: string;
  rule_name: string;
  proposed_rule: {
    endpoints: Array<{ host: string; port: number }>;
  };
  binary: string;
  rationale: string;
  security_notes: string;
  confidence: number;
  hit_count: number;
}

export async function getDraftPolicy(name: string) {
  return request<{
    chunks: DraftChunk[];
    draft_version: number;
    last_analyzed_at_ms: number;
  }>(`/api/sandboxes/${encodeURIComponent(name)}/draft-policy`);
}

export async function approveDraftChunk(sandboxName: string, chunkId: string) {
  return request<{ policy_version: number; policy_hash: string }>(
    `/api/sandboxes/${encodeURIComponent(sandboxName)}/draft-policy/${encodeURIComponent(chunkId)}/approve`,
    { method: "POST" }
  );
}

export async function rejectDraftChunk(
  sandboxName: string,
  chunkId: string,
  reason = ""
) {
  return request<{ ok: boolean }>(
    `/api/sandboxes/${encodeURIComponent(sandboxName)}/draft-policy/${encodeURIComponent(chunkId)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) }
  );
}

export async function undoDraftChunk(sandboxName: string, chunkId: string) {
  return request<{ policy_version: number }>(
    `/api/sandboxes/${encodeURIComponent(sandboxName)}/draft-policy/${encodeURIComponent(chunkId)}/undo`,
    { method: "POST" }
  );
}

export async function approveAllDraftChunks(
  sandboxName: string,
  includeSecurityFlagged = false
) {
  return request<{
    policy_version: number;
    chunks_approved: number;
    chunks_skipped: number;
  }>(
    `/api/sandboxes/${encodeURIComponent(sandboxName)}/draft-policy/approve-all`,
    {
      method: "POST",
      body: JSON.stringify({ include_security_flagged: includeSecurityFlagged }),
    }
  );
}

// Onboard status (legacy polling — kept for backwards compat)
export interface OnboardStatus {
  active: boolean;
  exitCode: number | null;
  startedAt: number | null;
  elapsedMs: number | null;
  tail: string[];
}

export async function getOnboardStatus(name: string) {
  return request<OnboardStatus>(
    `/api/sandboxes/${encodeURIComponent(name)}/onboard-status`
  );
}

// Job / SSE event types
export interface OnboardJob {
  id: string;
  sandbox_name: string;
  status: "queued" | "running" | "done" | "failed";
  started_at: number | null;
  finished_at: number | null;
  exit_code: number | null;
  log_path: string | null;
}

export interface JobStepEvent {
  id: number;
  job_id: string;
  step: string;
  /** "skipped" | "started" | "complete" | "failed" */
  status: string;
  ts: string;
  error?: string | null;
}

export type SseMessage =
  | { type: "job_state"; job: OnboardJob }
  | { type: "step_event" } & JobStepEvent
  | { type: "job_done"; status: string; exit_code: number | null; finished_at: number | null }
  | { type: "no_job"; sandbox: string };

/**
 * Returns the SSE endpoint URL for onboard job events.
 * Consume with `new EventSource(url, { withCredentials: true })`.
 */
export function jobEventsUrl(sandboxName: string): string {
  return `${API_BASE}/api/events?sandbox=${encodeURIComponent(sandboxName)}`;
}

// Fleet status
export interface FleetSandbox {
  name: string;
  phase: string;
  current_policy_version: number;
  created_at_ms: string;
  port_forward_active: boolean;
}

export interface FleetStatus {
  sandboxes: FleetSandbox[];
  inference: { provider: string | null; model: string | null };
  gateway_healthy: boolean;
}

export async function getFleetStatus() {
  return request<FleetStatus>("/api/health/fleet");
}

// Audit log
export interface AuditEvent {
  timestamp: string;
  type: "policy_update" | "api_request" | string;
  sandbox: string | null;
  details: string;
  method?: string;
  path?: string;
  status?: number;
  authenticated?: boolean;
}

export async function getAuditLog(params?: {
  sandbox?: string;
  type?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.sandbox) qs.set("sandbox", params.sandbox);
  if (params?.type) qs.set("type", params.type);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ events: AuditEvent[]; total: number }>(`/api/audit${query}`);
}

// Relay routes
export interface RelayRoute {
  id: string;
  from: string;
  to: string;
  description: string | null;
  created: string;
  message_count: number;
  last_used: string | null;
  from_active?: boolean;
  to_active?: boolean;
}

export interface RelayStatus {
  ok: boolean;
  route_count: number;
  active_sandboxes: string[];
  sandbox_ports: Record<string, number>;
  routes: RelayRoute[];
}

export async function getRelayStatus() {
  return request<RelayStatus>("/api/relay/status");
}

export async function listRelayRoutes() {
  return request<{ routes: RelayRoute[] }>("/api/relay/routes");
}

export async function createRelayRoute(from: string, to: string, description?: string) {
  return request<{ route: RelayRoute }>("/api/relay/routes", {
    method: "POST",
    body: JSON.stringify({ from, to, description }),
  });
}

export async function deleteRelayRoute(id: string) {
  return request<{ deleted: boolean; route: RelayRoute }>(
    `/api/relay/routes/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}
