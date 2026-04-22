"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetchStatus } from "@/lib/status";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard implements the first-run state machine:
 *
 *   1. !hasCredentials              → /setup  (admin account not created yet)
 *   2. hasCredentials + !authed     → /login
 *   3. authed + !hasSandbox + "/"  → /onboard (wizard for first sandbox)
 *   4. authed                       → render children
 *
 * /login and /setup are exempt — AppShell excludes them via PUBLIC_PATHS.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">(
    "checking"
  );

  useEffect(() => {
    const check = async () => {
      setStatus("checking");

      try {
        // Step 1 — system state (public, no auth needed)
        const appStatus = await fetchStatus();

        if (!appStatus.hasCredentials) {
          router.replace("/setup");
          return;
        }

        // Step 2 — session auth
        const meRes = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!meRes.ok) {
          setStatus("unauthenticated");
          router.replace("/login");
          return;
        }

        // Step 3 — root path with no sandbox → onboard wizard
        if (pathname === "/" && !appStatus.hasSandbox) {
          router.replace("/onboard");
          return;
        }

        setStatus("authenticated");
      } catch {
        // Network failure — fall back to login
        setStatus("unauthenticated");
        router.replace("/login");
      }
    };

    check();
  }, [pathname, router]);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
