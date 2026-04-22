export type AppStatus = { hasCredentials: boolean; hasSandbox: boolean };

export async function fetchStatus(): Promise<AppStatus> {
  const r = await fetch("/api/status", { cache: "no-store" });
  if (!r.ok) throw new Error("status " + r.status);
  return r.json();
}
