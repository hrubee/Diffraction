"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSandbox } from "@/lib/api";

const POLICY_PRESETS = [
  { id: "pypi", label: "PyPI" },
  { id: "npm", label: "npm" },
  { id: "telegram", label: "Telegram" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "docker", label: "Docker Hub" },
  { id: "huggingface", label: "Hugging Face" },
  { id: "jira", label: "Jira" },
  { id: "outlook", label: "Outlook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "zapier", label: "Zapier" },
] as const;

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$|^[a-z0-9]$/;

function validateName(value: string): string | null {
  if (!value) return "Name is required.";
  if (value.length > 30) return "Name must be 30 characters or fewer.";
  if (!NAME_RE.test(value))
    return "Name must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.";
  return null;
}

export default function NewSandboxPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [name, setName] = useState("my-assistant");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(
    new Set()
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleNameChange = (value: string) => {
    setName(value);
    setNameError(validateName(value));
  };

  const togglePreset = (id: string) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateName(name);
    if (err) {
      setNameError(err);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const spec: Record<string, unknown> = {};
      if (selectedPresets.size > 0) {
        spec.policy_presets = Array.from(selectedPresets);
      }
      await createSandbox(name, spec);
      startTransition(() => {
        router.push(`/sandboxes/${encodeURIComponent(name)}`);
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create sandbox."
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header with breadcrumb */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-zinc-500 mb-3">
          <Link
            href="/sandboxes"
            className="hover:text-zinc-300 transition-colors"
          >
            Sandboxes
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-200">New</span>
        </nav>
        <h1 className="text-2xl font-bold">New Sandbox</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Provision an isolated agent environment. This takes 30–60 seconds.
        </p>
      </div>

      {submitError && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400"
        >
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Sandbox name */}
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Identity
          </h2>
          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-name"
              className="block text-sm font-medium text-zinc-300"
            >
              Sandbox name
            </label>
            <input
              id="sandbox-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              placeholder="my-assistant"
              disabled={submitting}
              aria-describedby={nameError ? "name-error" : "name-hint"}
              aria-invalid={nameError ? "true" : undefined}
              className={[
                "w-full bg-zinc-900 border rounded-md px-3 py-2 text-sm font-mono",
                "placeholder-zinc-600 text-zinc-100",
                "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
                "disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
                nameError
                  ? "border-red-500/60"
                  : "border-zinc-700 hover:border-zinc-600",
              ].join(" ")}
            />
            {nameError ? (
              <p id="name-error" className="text-xs text-red-400 mt-1">
                {nameError}
              </p>
            ) : (
              <p id="name-hint" className="text-xs text-zinc-600 mt-1">
                Lowercase letters, numbers, and hyphens only. Max 30 characters.
              </p>
            )}
          </div>
        </div>

        {/* Policy presets */}
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Policy Presets
            </h2>
            <p className="text-xs text-zinc-600 mt-1">
              Grant network access to specific services. More presets can be
              added later.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {POLICY_PRESETS.map((preset) => {
              const checked = selectedPresets.has(preset.id);
              return (
                <label
                  key={preset.id}
                  className={[
                    "flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer",
                    "text-sm transition-colors select-none",
                    submitting ? "opacity-50 cursor-not-allowed" : "",
                    checked
                      ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300"
                      : "border-zinc-700/60 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => !submitting && togglePreset(preset.id)}
                    disabled={submitting}
                    className="sr-only"
                    aria-label={preset.label}
                  />
                  <span
                    className={[
                      "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                      "transition-colors",
                      checked
                        ? "bg-indigo-500 border-indigo-400"
                        : "bg-transparent border-zinc-600",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {checked && (
                      <svg
                        viewBox="0 0 10 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-2.5 h-2 text-white"
                      >
                        <path d="M1 4l2.5 2.5L9 1" />
                      </svg>
                    )}
                  </span>
                  {preset.label}
                </label>
              );
            })}
          </div>
        </div>

        {/* GPU toggle */}
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
            Hardware
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-300">GPU Acceleration</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                No GPU detected on this host
              </p>
            </div>
            {/* Toggle — always off, disabled */}
            <button
              type="button"
              role="switch"
              aria-checked="false"
              aria-label="GPU acceleration"
              disabled
              className="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full border-2 border-transparent bg-zinc-700 opacity-40 cursor-not-allowed transition-colors"
            >
              <span className="inline-block h-4 w-4 translate-x-0 rounded-full bg-zinc-400 shadow transition-transform" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting || !!nameError}
            className={[
              "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium",
              "bg-indigo-600 text-white transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              !submitting && !nameError
                ? "hover:bg-indigo-500 active:bg-indigo-700"
                : "",
            ].join(" ")}
          >
            {submitting ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Creating sandbox...
              </>
            ) : (
              "Create Sandbox"
            )}
          </button>
          <Link
            href="/sandboxes"
            className="px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Cancel
          </Link>
        </div>

        {submitting && (
          <p className="text-xs text-zinc-500">
            Provisioning the sandbox. This typically takes 30–60 seconds — do
            not close this page.
          </p>
        )}
      </form>
    </div>
  );
}
