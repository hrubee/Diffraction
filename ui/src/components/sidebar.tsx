"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/sandboxes", label: "Sandboxes", icon: "box" },
  { href: "/channels", label: "Channels", icon: "channels" },
  { href: "/connect-tools", label: "Connect Tools", icon: "plug" },
  { href: "/providers", label: "Providers", icon: "key" },
  { href: "/models", label: "Models", icon: "cpu" },
  { href: "/skills", label: "Skills", icon: "zap" },
  { href: "/settings", label: "Settings", icon: "sliders" },
];

const icons: Record<string, string> = {
  grid: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
  box: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  channels: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  cpu: "M18 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2zM9 9h6v6H9z",
  zap: "M13 2L3 14h9l-1 10 10-12h-9l1-10z",
  plug: "M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83",
  sliders:
    "M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6",
};

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-zinc-950 border-r border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold text-white tracking-tight">
          Diffract
        </h1>
        <p className="text-xs text-zinc-500">Control Plane</p>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {nav.map(({ href, label, icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-indigo-600/20 text-indigo-400"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={icons[icon]}
                />
              </svg>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-zinc-800 text-xs text-zinc-600">
        v0.1.0
      </div>
    </aside>
  );
}
