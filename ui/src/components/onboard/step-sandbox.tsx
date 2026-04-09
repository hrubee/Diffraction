"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { checkSandboxNameConflict } from "@/lib/onboard-client";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$|^[a-z0-9]{3,32}$/;

interface StepSandboxProps {
  value: string;
  onChange: (name: string) => void;
  onConflict: (conflict: boolean) => void;
}

type CheckState = "idle" | "checking" | "ok" | "conflict" | "invalid";

export function StepSandbox({ value, onChange, onConflict }: StepSandboxProps) {
  const [checkState, setCheckState] = useState<CheckState>("idle");

  useEffect(() => {
    if (!value) { setCheckState("idle"); onConflict(false); return; }
    if (!SLUG_RE.test(value)) { setCheckState("invalid"); onConflict(true); return; }

    setCheckState("checking");
    const timer = setTimeout(async () => {
      try {
        const exists = await checkSandboxNameConflict(value);
        if (exists) { setCheckState("conflict"); onConflict(true); }
        else { setCheckState("ok"); onConflict(false); }
      } catch {
        setCheckState("ok"); onConflict(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Name your sandbox</h2>
      <p className="text-sm text-zinc-400">
        Lowercase letters, digits, and hyphens only (3–32 chars).
      </p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">Sandbox name</label>
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="my-agent"
            maxLength={32}
            className={`w-full px-3 py-2 pr-10 rounded-md bg-zinc-800 border text-zinc-100 text-sm placeholder:text-zinc-600 focus:outline-none ${
              checkState === "ok"
                ? "border-emerald-600 focus:border-emerald-500"
                : checkState === "conflict" || checkState === "invalid"
                ? "border-red-600 focus:border-red-500"
                : "border-zinc-700 focus:border-zinc-500"
            }`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {checkState === "checking" && <Loader2 size={14} className="animate-spin text-zinc-500" />}
            {checkState === "ok" && <CheckCircle size={14} className="text-emerald-400" />}
            {(checkState === "conflict" || checkState === "invalid") && <XCircle size={14} className="text-red-400" />}
          </span>
        </div>

        {checkState === "invalid" && (
          <p className="text-xs text-red-400">
            Must be 3–32 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen.
          </p>
        )}
        {checkState === "conflict" && (
          <p className="text-xs text-red-400">A sandbox with this name already exists.</p>
        )}
        {checkState === "ok" && (
          <p className="text-xs text-emerald-400">Name available.</p>
        )}
      </div>
    </div>
  );
}
