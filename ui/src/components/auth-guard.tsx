"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Client component that protects all routes requiring authentication.
 * On mount it calls GET /api/auth/me:
 *   - 200: renders children immediately
 *   - 401: redirects to /login
 * While the check is in-flight it shows a full-screen loading indicator.
 *
 * The /login route itself is exempt — this guard is not rendered there
 * (see layout.tsx).
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">(
    "checking"
  );

  useEffect(() => {
    // Re-run the check whenever the route changes so a mid-session expiry is
    // caught on next navigation.
    const check = async () => {
      setStatus("checking");
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          // No cache — auth state must always be fresh.
          cache: "no-store",
        });
        if (res.ok) {
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
          router.replace("/login");
        }
      } catch {
        // Network failure — treat as unauthenticated and redirect.
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
    // Redirect is in progress — render nothing to avoid flash of content.
    return null;
  }

  return <>{children}</>;
}
