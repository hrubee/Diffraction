"use client";

import { GatewayProvider } from "@/lib/use-gateway";
import { AppShell } from "@/components/app-shell";

export function AuthenticatedShell({
  token,
  wsUrl,
  children,
}: {
  token: string;
  wsUrl: string;
  children: React.ReactNode;
}) {
  return (
    <GatewayProvider token={token} wsUrl={wsUrl}>
      <AppShell>{children}</AppShell>
    </GatewayProvider>
  );
}
