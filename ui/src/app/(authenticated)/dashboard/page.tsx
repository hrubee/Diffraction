"use client";

import { useEffect, useState } from "react";
import { useGateway } from "@/lib/use-gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, WifiOff, Cpu, Shield, Activity, AlertCircle, TrendingUp, Coins } from "lucide-react";

interface Sandbox {
  name: string;
  model?: string;
  provider?: string;
  policies?: string[];
}

interface UsageRecord {
  sandbox: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-6 w-16" />
      </CardContent>
    </Card>
  );
}

function RowSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-5 w-16" />
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { connected } = useGateway();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [health, setHealth] = useState<{ ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sbRes, healthRes, usageRes] = await Promise.allSettled([
          fetch("/api/sandboxes").then((r) => (r.ok ? r.json() : Promise.reject(r.statusText))),
          fetch("/api/gateway/health").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/usage").then((r) => (r.ok ? r.json() : [])),
        ]);

        if (sbRes.status === "fulfilled") setSandboxes(sbRes.value);
        else setError("Failed to load sandboxes");

        if (healthRes.status === "fulfilled") setHealth(healthRes.value);
        if (usageRes.status === "fulfilled") setUsage(usageRes.value ?? []);
      } catch {
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalCalls = usage.reduce((sum, u) => sum + u.calls, 0);
  const totalTokens = usage.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
  const totalCost = usage.reduce((sum, u) => sum + u.estimatedCostUsd, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Gateway</CardTitle>
                {connected ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <Badge variant={connected ? "default" : "destructive"}>
                  {connected ? "Connected" : "Disconnected"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Sandboxes</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{sandboxes.length}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Health</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge variant={health?.ok ? "default" : "secondary"}>
                  {health === null ? "Checking..." : health?.ok ? "Healthy" : "Degraded"}
                </Badge>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Usage metering */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Usage Metering
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Inference Calls</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalCalls.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {totalTokens >= 1000
                    ? `${(totalTokens / 1000).toFixed(1)}K`
                    : totalTokens.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Est. Cost</CardTitle>
                <Coins className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">${totalCost.toFixed(4)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && usage.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Sandbox</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium hidden sm:table-cell">In Tokens</th>
                  <th className="px-4 py-2 text-right font-medium hidden sm:table-cell">Out Tokens</th>
                  <th className="px-4 py-2 text-right font-medium">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.sandbox} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono">{u.sandbox}</td>
                    <td className="px-4 py-2 text-right">{u.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right hidden sm:table-cell">
                      {u.inputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right hidden sm:table-cell">
                      {u.outputTokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">${u.estimatedCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && usage.length === 0 && (
          <p className="text-muted-foreground text-sm">No usage data available yet.</p>
        )}
      </div>

      {/* Sandbox list */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Sandboxes</h2>
        <div className="space-y-3">
          {loading ? (
            <>
              <RowSkeleton />
              <RowSkeleton />
            </>
          ) : (
            <>
              {sandboxes.map((sb) => (
                <Card key={sb.name}>
                  <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="font-medium">{sb.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {sb.model || "no model"} / {sb.provider || "no provider"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(sb.policies || []).map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {sandboxes.length === 0 && !error && (
                <p className="text-muted-foreground text-sm">No sandboxes found</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
