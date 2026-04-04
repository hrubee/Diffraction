"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getFleetStatus, getRelayStatus } from "@/lib/api";
import type { FleetStatus, FleetSandbox, RelayStatus } from "@/lib/api";
import StatusBadge from "@/components/status-badge";

// ---- Stat card ----

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

// ---- Gateway indicator ----

function GatewayIndicator({ healthy }: { healthy: boolean | null }) {
  if (healthy === null) {
    return (
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 animate-pulse" />
        <span>Connecting...</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span
        className={`w-2.5 h-2.5 rounded-full ${
          healthy ? "bg-emerald-400" : "bg-red-400"
        }`}
      />
      <span>{healthy ? "Healthy" : "Unavailable"}</span>
    </span>
  );
}

// ---- Relay status indicator ----

function RelayIndicator({ relay }: { relay: RelayStatus | null }) {
  if (!relay) {
    return (
      <span className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 animate-pulse" />
        <span>Loading...</span>
      </span>
    );
  }
  const activeRoutes = relay.routes.filter((r) => r.from_active && r.to_active).length;
  return (
    <span className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 rounded-full ${relay.ok ? "bg-emerald-400" : "bg-red-400"}`} />
      <span>
        {relay.route_count} route{relay.route_count !== 1 ? "s" : ""}
        {relay.route_count > 0 && (
          <span className="text-zinc-500 ml-1">
            ({activeRoutes} active)
          </span>
        )}
      </span>
    </span>
  );
}

// ---- Sandbox health bar ----

function HealthBar({ sandboxes }: { sandboxes: FleetSandbox[] }) {
  if (sandboxes.length === 0) return null;
  const phases = sandboxes.reduce<Record<string, number>>((acc, s) => {
    const phase = s.phase.replace("SANDBOX_PHASE_", "").toLowerCase();
    acc[phase] = (acc[phase] ?? 0) + 1;
    return acc;
  }, {});

  const phaseColor: Record<string, string> = {
    ready: "bg-emerald-500",
    creating: "bg-yellow-500",
    terminating: "bg-orange-500",
    error: "bg-red-500",
    unknown: "bg-zinc-600",
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {Object.entries(phases).map(([phase, count]) => (
        <span key={phase} className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className={`w-2 h-2 rounded-full ${phaseColor[phase] ?? "bg-zinc-600"}`} />
          {count} {phase}
        </span>
      ))}
    </div>
  );
}

// ---- Sandbox card ----

function SandboxCard({
  sandbox,
  relayRouteCount,
}: {
  sandbox: FleetSandbox;
  relayRouteCount: number;
}) {
  const created = sandbox.created_at_ms
    ? new Date(Number(sandbox.created_at_ms)).toLocaleDateString()
    : "---";

  return (
    <Link
      href={`/sandboxes/${encodeURIComponent(sandbox.name)}`}
      className="block bg-zinc-800/40 border border-zinc-700/50 rounded-lg p-4
                 hover:bg-zinc-800/70 hover:border-zinc-600/50 transition-colors
                 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="font-medium text-sm truncate">{sandbox.name}</span>
        <StatusBadge phase={sandbox.phase} />
      </div>

      <div className="space-y-1 text-xs text-zinc-500">
        <div className="flex items-center justify-between">
          <span>Policy</span>
          <span className="text-zinc-400">v{sandbox.current_policy_version ?? 0}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Created</span>
          <span className="text-zinc-400">{created}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Port Forward</span>
          <span
            className={
              sandbox.port_forward_active ? "text-emerald-400" : "text-zinc-600"
            }
          >
            {sandbox.port_forward_active ? "Active" : "Inactive"}
          </span>
        </div>
        {relayRouteCount > 0 && (
          <div className="flex items-center justify-between">
            <span>Relay routes</span>
            <span className="text-indigo-400">{relayRouteCount}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

// ---- Relay routes summary ----

function RelayRoutesSummary({ relay }: { relay: RelayStatus }) {
  if (relay.routes.length === 0) return null;

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Active Relay Routes</h3>
        <Link
          href="/channels"
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Manage
        </Link>
      </div>
      <div className="space-y-2">
        {relay.routes.slice(0, 5).map((route) => (
          <div
            key={route.id}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                route.from_active && route.to_active
                  ? "bg-emerald-400"
                  : "bg-zinc-600"
              }`}
            />
            <span className="font-mono text-zinc-300">{route.from}</span>
            <svg
              className="w-3 h-3 text-zinc-600 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span className="font-mono text-zinc-300">{route.to}</span>
            {route.message_count > 0 && (
              <span className="ml-auto text-zinc-600">{route.message_count} msgs</span>
            )}
          </div>
        ))}
        {relay.routes.length > 5 && (
          <p className="text-xs text-zinc-600">
            +{relay.routes.length - 5} more routes
          </p>
        )}
      </div>
    </div>
  );
}

// ---- Empty state ----

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-zinc-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
          />
        </svg>
      </div>
      <p className="text-sm text-zinc-400 mb-1">No sandboxes yet</p>
      <p className="text-xs text-zinc-600 mb-4">
        Create your first sandbox to get started
      </p>
      <Link
        href="/sandboxes/new"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600
                   hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
      >
        Create Sandbox
      </Link>
    </div>
  );
}

// ---- Page ----

export default function FleetDashboard() {
  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [relay, setRelay] = useState<RelayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [fleetData, relayData] = await Promise.allSettled([
        getFleetStatus(),
        getRelayStatus(),
      ]);
      if (fleetData.status === "fulfilled") {
        setFleet(fleetData.value);
        setError(null);
      } else {
        setError(fleetData.reason instanceof Error ? fleetData.reason.message : "Failed to load fleet status");
      }
      if (relayData.status === "fulfilled") {
        setRelay(relayData.value);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const sandboxes = fleet?.sandboxes ?? [];
  const readyCount = sandboxes.filter(
    (s) => s.phase === "SANDBOX_PHASE_READY"
  ).length;

  // Count relay routes per sandbox (as source or target)
  const relayCountBySandbox = (relay?.routes ?? []).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.from] = (acc[r.from] ?? 0) + 1;
      acc[r.to] = (acc[r.to] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Fleet Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Diffract Control Plane</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Sandboxes"
          value={
            loading ? (
              <span className="text-zinc-500">—</span>
            ) : (
              sandboxes.length
            )
          }
          sub={
            !loading && (
              <HealthBar sandboxes={sandboxes} />
            )
          }
        />

        <StatCard
          label="Active Model"
          value={
            loading ? (
              <span className="text-zinc-500">—</span>
            ) : fleet?.inference.model ? (
              <span className="truncate block text-base">{fleet.inference.model}</span>
            ) : (
              <span className="text-zinc-500 text-base">Not configured</span>
            )
          }
          sub={fleet?.inference.provider ?? undefined}
        />

        <StatCard
          label="Gateway"
          value={
            <GatewayIndicator
              healthy={fleet ? fleet.gateway_healthy : null}
            />
          }
        />

        <StatCard
          label="Relay"
          value={<RelayIndicator relay={relay} />}
          sub={
            relay
              ? `${relay.active_sandboxes.length} sandbox${relay.active_sandboxes.length !== 1 ? "es" : ""} reachable`
              : undefined
          }
        />
      </div>

      {/* Sandbox grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Sandboxes</h2>
          <Link
            href="/sandboxes"
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-4 animate-pulse h-[140px]"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sandboxes.length === 0 ? (
              <EmptyState />
            ) : (
              sandboxes.map((sb) => (
                <SandboxCard
                  key={sb.name}
                  sandbox={sb}
                  relayRouteCount={relayCountBySandbox[sb.name] ?? 0}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Relay routes summary */}
      {relay && relay.routes.length > 0 && (
        <RelayRoutesSummary relay={relay} />
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
        <Link
          href="/sandboxes/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600
                     hover:bg-indigo-500 text-sm font-medium text-white transition-colors
                     focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Sandbox
        </Link>

        <Link
          href="/sandboxes"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md
                     bg-zinc-800 hover:bg-zinc-700 border border-zinc-700
                     text-sm font-medium text-zinc-300 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-zinc-500/50"
        >
          View All Sandboxes
        </Link>

        <Link
          href="/channels"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md
                     bg-zinc-800 hover:bg-zinc-700 border border-zinc-700
                     text-sm font-medium text-zinc-300 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-zinc-500/50"
        >
          Manage Channels
        </Link>
      </div>
    </div>
  );
}
