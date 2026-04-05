"use client";

import { useEffect, useState } from "react";
import { useGateway } from "@/lib/use-gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Wifi, WifiOff, Server, Key, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

interface GatewayInfo {
  version?: string;
  uptime?: number;
}

export default function SettingsPage() {
  const { connected } = useGateway();
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    loadGatewayInfo();
  }, []);

  async function loadGatewayInfo() {
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const res = await fetch("/api/gateway/health", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setGatewayInfo(data);
      } else {
        setInfoError("Could not fetch gateway details");
      }
    } catch {
      setInfoError("Could not fetch gateway details");
    } finally {
      setLoadingInfo(false);
    }
  }

  async function handleLogout() {
    setLogoutPending(true);
    setLogoutError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (res.ok) {
        window.location.href = "/login";
      } else {
        setLogoutError("Logout failed. Try again.");
      }
    } catch {
      setLogoutError("Logout failed. Try again.");
    } finally {
      setLogoutPending(false);
    }
  }

  function formatUptime(seconds?: number) {
    if (!seconds) return "—";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4 w-full max-w-lg">
        {/* Gateway Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4" /> Gateway Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Status</span>
              <Badge variant={connected ? "default" : "destructive"} className="gap-1">
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Port</span>
              <span className="text-sm text-muted-foreground font-mono">18789</span>
            </div>

            {loadingInfo ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Version</span>
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Uptime</span>
                  <Skeleton className="h-4 w-16" />
                </div>
              </>
            ) : infoError ? (
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {infoError}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-auto"
                  onClick={loadGatewayInfo}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                {gatewayInfo?.version && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Version</span>
                    <span className="text-sm text-muted-foreground font-mono">
                      {gatewayInfo.version}
                    </span>
                  </div>
                )}
                {gatewayInfo?.uptime !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Uptime</span>
                    <span className="text-sm text-muted-foreground">
                      {formatUptime(gatewayInfo.uptime)}
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4" /> Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Auth Mode</span>
              <span className="text-sm text-muted-foreground">Token</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Token is stored in an httpOnly cookie. Logout clears it.
            </p>

            {logoutError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {logoutError}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLogout}
              disabled={logoutPending}
            >
              {logoutPending ? "Signing out..." : "Sign Out"}
            </Button>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> About
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Platform</span>
              <span className="text-sm text-muted-foreground">Diffract</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Security</span>
              <Badge variant="outline" className="text-xs">Landlock + seccomp</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
