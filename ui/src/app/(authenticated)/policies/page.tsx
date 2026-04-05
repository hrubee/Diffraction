"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ShieldCheck, AlertCircle, GitCompare, ChevronDown } from "lucide-react";

interface PolicyPreset {
  name: string;
  description: string;
  applied: boolean;
}

interface Sandbox {
  name: string;
}

type Tab = "presets" | "compare";

function PresetSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

function PolicyList({ policies }: { policies: PolicyPreset[] }) {
  if (policies.length === 0) {
    return <p className="text-sm text-muted-foreground">No policies found for this sandbox.</p>;
  }
  return (
    <div className="space-y-2">
      {policies.map((p) => (
        <div key={p.name} className="flex items-start gap-2">
          {p.applied ? (
            <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          ) : (
            <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          )}
          <div>
            <p className={`text-sm font-medium capitalize ${p.applied ? "text-primary" : ""}`}>
              {p.name}
              {p.applied && (
                <Badge className="ml-2 text-xs" variant="default">
                  Applied
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{p.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("presets");
  const [presets, setPresets] = useState<PolicyPreset[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Compare tab state
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [leftSandbox, setLeftSandbox] = useState<string>("");
  const [rightSandbox, setRightSandbox] = useState<string>("");
  const [leftPolicies, setLeftPolicies] = useState<PolicyPreset[] | null>(null);
  const [rightPolicies, setRightPolicies] = useState<PolicyPreset[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    loadPresets();
    loadSandboxes();
  }, []);

  async function loadPresets() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sandboxes/my-assistant/policy", { credentials: "include" });
      if (res.ok) {
        setPresets(await res.json());
      } else {
        setError("Failed to load policies");
      }
    } catch {
      setError("Failed to load policies");
    } finally {
      setLoading(false);
    }
  }

  async function loadSandboxes() {
    try {
      const res = await fetch("/api/sandboxes", { credentials: "include" });
      if (res.ok) {
        const data: Sandbox[] = await res.json();
        setSandboxes(data);
        if (data.length >= 1) setLeftSandbox(data[0].name);
        if (data.length >= 2) setRightSandbox(data[1].name);
      }
    } catch {}
  }

  async function handleApply(name: string) {
    setApplying(name);
    setError(null);
    try {
      const res = await fetch("/api/sandboxes/my-assistant/policy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: name }),
      });
      if (res.ok) {
        await loadPresets();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to apply policy");
      }
    } catch {
      setError("Failed to apply policy");
    } finally {
      setApplying(null);
    }
  }

  async function handleCompare() {
    if (!leftSandbox || !rightSandbox) return;
    setComparing(true);
    setCompareError(null);
    setLeftPolicies(null);
    setRightPolicies(null);
    try {
      const [lRes, rRes] = await Promise.all([
        fetch(`/api/sandboxes/${encodeURIComponent(leftSandbox)}/policy`, { credentials: "include" }),
        fetch(`/api/sandboxes/${encodeURIComponent(rightSandbox)}/policy`, { credentials: "include" }),
      ]);
      if (!lRes.ok || !rRes.ok) {
        setCompareError("Failed to fetch policies for one or both sandboxes");
        return;
      }
      const [lData, rData]: [PolicyPreset[], PolicyPreset[]] = await Promise.all([
        lRes.json(),
        rRes.json(),
      ]);
      setLeftPolicies(lData);
      setRightPolicies(rData);
    } catch {
      setCompareError("Failed to compare policies");
    } finally {
      setComparing(false);
    }
  }

  // Compute diff: which policy names appear in one but not the other, or differ in applied state
  const allNames = leftPolicies && rightPolicies
    ? Array.from(new Set([...leftPolicies.map((p) => p.name), ...rightPolicies.map((p) => p.name)]))
    : [];

  function findPolicy(list: PolicyPreset[], name: string) {
    return list.find((p) => p.name === name);
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Network Policies</h1>
      <p className="text-muted-foreground">
        Control what external services the agent can access. Applied presets are enforced at the OS level.
      </p>

      {/* Tab bar */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("presets")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "presets"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Presets
        </button>
        <button
          onClick={() => setActiveTab("compare")}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "compare"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitCompare className="h-3.5 w-3.5" />
          Compare
        </button>
      </div>

      {/* Presets tab */}
      {activeTab === "presets" && (
        <div className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <>
                <PresetSkeleton />
                <PresetSkeleton />
                <PresetSkeleton />
                <PresetSkeleton />
              </>
            ) : (
              presets.map((p) => (
                <Card key={p.name} className={p.applied ? "border-primary/50" : ""}>
                  <CardContent className="pt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.applied ? (
                        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                      ) : (
                        <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium capitalize">{p.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{p.description}</p>
                      </div>
                    </div>
                    {p.applied ? (
                      <Badge className="shrink-0">Applied</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => handleApply(p.name)}
                        disabled={applying === p.name}
                      >
                        {applying === p.name ? "Applying..." : "Apply"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {!loading && presets.length === 0 && !error && (
            <p className="text-muted-foreground text-sm">No policy presets available.</p>
          )}
        </div>
      )}

      {/* Compare tab */}
      {activeTab === "compare" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select two sandboxes to compare their applied policies side-by-side.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
            {/* Left selector */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-xs text-muted-foreground font-medium">Left sandbox</label>
              <div className="relative">
                <select
                  value={leftSandbox}
                  onChange={(e) => setLeftSandbox(e.target.value)}
                  className="w-full appearance-none rounded-md border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {sandboxes.length === 0 && <option value="">No sandboxes</option>}
                  {sandboxes.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Right selector */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label className="text-xs text-muted-foreground font-medium">Right sandbox</label>
              <div className="relative">
                <select
                  value={rightSandbox}
                  onChange={(e) => setRightSandbox(e.target.value)}
                  className="w-full appearance-none rounded-md border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {sandboxes.length === 0 && <option value="">No sandboxes</option>}
                  {sandboxes.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <Button
              onClick={handleCompare}
              disabled={comparing || !leftSandbox || !rightSandbox}
              className="sm:self-end"
            >
              {comparing ? "Comparing..." : "Compare"}
            </Button>
          </div>

          {compareError && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {compareError}
            </div>
          )}

          {leftPolicies && rightPolicies && (
            <div className="space-y-3">
              {/* Column headers */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono">{leftSandbox}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono">{rightSandbox}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Diff rows */}
              <div className="space-y-1">
                {allNames.map((name) => {
                  const left = findPolicy(leftPolicies, name);
                  const right = findPolicy(rightPolicies, name);
                  const differs =
                    !left || !right || left.applied !== right.applied;
                  return (
                    <div
                      key={name}
                      className={`grid grid-cols-2 gap-4 rounded-md p-2 text-sm ${
                        differs ? "bg-yellow-500/10 border border-yellow-500/30" : ""
                      }`}
                    >
                      {/* Left cell */}
                      <div className="flex items-center gap-2">
                        {left ? (
                          left.applied ? (
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                          )
                        ) : (
                          <span className="h-4 w-4 shrink-0" />
                        )}
                        <span className={left?.applied ? "text-primary font-medium" : "text-muted-foreground"}>
                          {name}
                        </span>
                        {!left && (
                          <Badge variant="outline" className="text-xs ml-1">
                            missing
                          </Badge>
                        )}
                      </div>

                      {/* Right cell */}
                      <div className="flex items-center gap-2">
                        {right ? (
                          right.applied ? (
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                          )
                        ) : (
                          <span className="h-4 w-4 shrink-0" />
                        )}
                        <span className={right?.applied ? "text-primary font-medium" : "text-muted-foreground"}>
                          {name}
                        </span>
                        {!right && (
                          <Badge variant="outline" className="text-xs ml-1">
                            missing
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {allNames.length === 0 && (
                <p className="text-muted-foreground text-sm">Both sandboxes have no policies configured.</p>
              )}

              {/* Summary */}
              {allNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {allNames.filter((n) => {
                    const l = findPolicy(leftPolicies, n);
                    const r = findPolicy(rightPolicies, n);
                    return !l || !r || l.applied !== r.applied;
                  }).length} difference(s) found across {allNames.length} policies.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
