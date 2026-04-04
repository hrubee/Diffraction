"use client";

import { useState } from "react";
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
 * On mobile (< md) the sidebar is hidden behind a hamburger menu in the
 * fixed top bar. On desktop (md+) the sidebar is always visible.
 *
 * This must be a client component because usePathname() and useState()
 * require the client navigation context.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      {/* Mobile top bar — hidden on md+ where sidebar is always visible */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 bg-zinc-950 border-b border-zinc-800 shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-zinc-400 hover:text-white p-1.5 rounded-md"
          aria-label="Open navigation"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <span className="ml-3 text-sm font-bold text-white tracking-tight">
          Diffract
        </span>
      </header>

      {/* Sidebar: overlay drawer on mobile, static column on desktop */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — offset by mobile top bar height on small screens */}
      <main className="flex-1 overflow-auto min-w-0 pt-14 md:pt-0">
        {children}
      </main>
    </AuthGuard>
  );
}
