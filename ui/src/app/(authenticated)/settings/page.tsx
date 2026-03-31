"use client";

import { useGateway } from "@/lib/use-gateway";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Server, Key } from "lucide-react";

export default function SettingsPage() {
  const { connected } = useGateway();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Server className="h-4 w-4" /> Gateway Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Status</span>
              <Badge variant={connected ? "default" : "destructive"} className="gap-1">
                {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {connected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Port</span>
              <span className="text-sm text-muted-foreground">18789</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Key className="h-4 w-4" /> Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Auth Mode</span>
              <span className="text-sm text-muted-foreground">Token</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Token is stored in an httpOnly cookie. Logout clears it.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
