"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeJobEvents } from "@/lib/onboard-client";

const FSM_STEPS = [
  "preflight",
  "gateway",
  "provider",
  "inference",
  "sandbox",
  "policies",
  "complete",
];

interface LogLine {
  ts: string;
  step: string;
  status: string;
  error?: string | null;
}

interface ProvisioningViewProps {
  sandboxName: string;
  onSuccess: () => void;
  onRetry: (error: string) => void;
}

export function ProvisioningView({ sandboxName, onSuccess, onRetry }: ProvisioningViewProps) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [currentFsmStep, setCurrentFsmStep] = useState<string>("preflight");
  const [phase, setPhase] = useState<"running" | "done" | "failed">("running");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fsmIndex = FSM_STEPS.indexOf(currentFsmStep);
  const progress = fsmIndex >= 0 ? Math.round(((fsmIndex + 1) / FSM_STEPS.length) * 100) : 5;

  useEffect(() => {
    const unsub = subscribeJobEvents(
      sandboxName,
      (evt) => {
        if (evt.type === "step_event") {
          setCurrentFsmStep(evt.step);
          setLogs((prev) => [...prev, { ts: new Date().toISOString(), step: evt.step, status: evt.status, error: evt.error }]);
        } else if (evt.type === "job_done") {
          const ok = evt.status === "done" && evt.exit_code === 0;
          setPhase(ok ? "done" : "failed");
          setExitCode(evt.exit_code);
          if (ok) {
            setConfirming(true);
            setTimeout(() => onSuccess(), 1500);
          }
        }
      },
      (err) => {
        setLogs((prev) => [...prev, { ts: new Date().toISOString(), step: "connection", status: "failed", error: err }]);
        setPhase("failed");
      }
    );
    return unsub;
  }, [sandboxName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Provisioning {sandboxName}</h2>
        <p className="text-sm text-zinc-400">
          {phase === "running" ? `Step: ${currentFsmStep}` : phase === "done" ? "Complete" : "Provisioning failed"}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${phase === "failed" ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${phase === "done" ? 100 : progress}%` }}
        />
      </div>

      {/* FSM step labels */}
      <div className="flex gap-1 flex-wrap">
        {FSM_STEPS.map((s, i) => (
          <span
            key={s}
            className={`text-xs px-2 py-0.5 rounded-full ${
              i < fsmIndex
                ? "bg-emerald-900 text-emerald-300"
                : i === fsmIndex
                ? "bg-zinc-700 text-zinc-200"
                : "bg-zinc-900 text-zinc-600"
            }`}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Terminal log panel */}
      <div className="flex-1 min-h-0 bg-black rounded-lg border border-zinc-800 overflow-auto font-mono text-xs p-3 space-y-0.5">
        {logs.length === 0 && (
          <p className="text-zinc-600">Waiting for provisioning events…</p>
        )}
        {logs.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-zinc-700 shrink-0">{line.ts.substring(11, 19)}</span>
            <span
              className={
                line.status === "failed"
                  ? "text-red-400"
                  : line.status === "complete"
                  ? "text-emerald-400"
                  : line.status === "started"
                  ? "text-blue-400"
                  : "text-zinc-400"
              }
            >
              [{line.step}] {line.status}
              {line.error ? ` — ${line.error}` : ""}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {phase === "running" && <Loader2 size={14} className="animate-spin text-zinc-400" />}
          {phase === "done" && !confirming && <CheckCircle size={14} className="text-emerald-400" />}
          {confirming && <CheckCircle size={14} className="text-emerald-400" />}
          {phase === "failed" && <XCircle size={14} className="text-red-400" />}
          <span className="text-zinc-400">
            {phase === "running" && `Running — ${currentFsmStep}…`}
            {phase === "done" && (confirming ? "Success! Redirecting…" : "Done")}
            {phase === "failed" && `Failed (exit ${exitCode ?? "?"})`}
          </span>
        </div>

        {phase === "failed" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(logs.filter(l => l.error).map(l => l.error).join("; "))}
            >
              Edit inputs
            </Button>
          </div>
        )}
      </div>

      {phase === "failed" && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-900 bg-red-950/30 text-sm text-red-300">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            Provisioning failed. Check the log above for details. You can edit your inputs and retry.
          </span>
        </div>
      )}
    </div>
  );
}
