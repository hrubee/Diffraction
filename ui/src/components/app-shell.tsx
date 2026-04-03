"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { AuthGuard } from "@/components/auth-guard";

// Routes that render without the sidebar and without auth enforcement.
const PUBLIC_PATHS = ["/login"];

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * AppShell is the client boundary that gates the Sidebar and AuthGuard.
 * - On /login: renders children directly — no sidebar, no auth check.
 * - On all other routes: wraps children in AuthGuard and renders Sidebar.
 *
 * This must be a client component because usePathname() requires the
 * client navigation context.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </AuthGuard>
  );
}
