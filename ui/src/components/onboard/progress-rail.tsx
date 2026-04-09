"use client";

import { Check } from "lucide-react";

const STEPS = [
  "Provider",
  "API Key",
  "Model",
  "Sandbox",
  "Policies",
];

interface ProgressRailProps {
  currentStep: number; // 0-indexed
  completedSteps: Set<number>;
}

export function ProgressRail({ currentStep, completedSteps }: ProgressRailProps) {
  return (
    <nav className="flex flex-col gap-1 w-44 shrink-0">
      {STEPS.map((label, idx) => {
        const done = completedSteps.has(idx);
        const active = idx === currentStep;
        return (
          <div
            key={idx}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-800 text-zinc-100"
                : done
                ? "text-zinc-400"
                : "text-zinc-600"
            }`}
          >
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full border text-xs shrink-0 ${
                done
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : active
                  ? "border-zinc-400 text-zinc-300"
                  : "border-zinc-700 text-zinc-600"
              }`}
            >
              {done ? <Check size={12} /> : idx + 1}
            </span>
            {label}
          </div>
        );
      })}
    </nav>
  );
}
