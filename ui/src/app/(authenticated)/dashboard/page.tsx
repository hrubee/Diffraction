"use client";

import { useEffect, useState } from "react";
import { useGateway } from "@/lib/use-gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Cpu, Shield, Activity } from "lucide-react";

export default function DashboardPage() {
  const { connected } = useGateway();
  const [sandboxes, setSandboxes] = useState<Array<{ name: string; model?: string; provider?: string; policies?: string[] }>>([]);
  const [health, setHealth] = useState<{ ok: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/sandboxes").then((r) => r.json()).then(setSandboxes).catch(() => {});
    fetch("/api/gateway/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Gateway</CardTitle>
            {connected ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
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
              {health?.ok ? "Healthy" : "Checking..."}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Sandbox list */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Sandboxes</h2>
        <div className="space-y-3">
          {sandboxes.map((sb) => (
            <Card key={sb.name}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{sb.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {sb.model || "no model"} / {sb.provider || "no provider"}
                  </p>
                </div>
                <div className="flex gap-1">
                  {(sb.policies || []).map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {sandboxes.length === 0 && (
            <p className="text-muted-foreground text-sm">No sandboxes found</p>
          )}
        </div>
      </div>
    </div>
  );
}
