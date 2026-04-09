"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgressRail } from "@/components/onboard/progress-rail";
import { StepProvider } from "@/components/onboard/step-provider";
import { StepApiKey } from "@/components/onboard/step-api-key";
import { StepModel } from "@/components/onboard/step-model";
import { StepSandbox } from "@/components/onboard/step-sandbox";
import { StepPolicies } from "@/components/onboard/step-policies";
import { ProvisioningView } from "@/components/onboard/provisioning-view";
import { Button } from "@/components/ui/button";
import { startOnboard } from "@/lib/onboard-client";
import type { Provider } from "@/lib/onboard-client";

const TOTAL_STEPS = 5;

export default function OnboardPage() {
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [provisioning, setProvisioning] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Form state
  const [provider, setProvider] = useState<Provider>("nvidia-nim");
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [model, setModel] = useState("");
  const [sandboxName, setSandboxName] = useState("");
  const [sandboxConflict, setSandboxConflict] = useState(false);
  const [policies, setPolicies] = useState<string[]>([]);

  function canAdvance(): boolean {
    if (step === 0) return !!provider;
    if (step === 1) {
      const needsKey = ["nvidia-nim", "openai", "anthropic"].includes(provider);
      const needsEndpoint = provider === "ollama" || provider === "custom";
      if (needsKey && !apiKey) return false;
      if (needsEndpoint && !endpointUrl) return false;
      return true;
    }
    if (step === 2) return !!model;
    if (step === 3) return !!sandboxName && !sandboxConflict;
    if (step === 4) return true; // policies optional
    return false;
  }

  function advance() {
    if (step < TOTAL_STEPS - 1) {
      setCompleted((prev) => new Set([...prev, step]));
      setStep(step + 1);
    }
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  async function handleStart() {
    setStartError(null);
    try {
      await startOnboard({
        provider,
        apiKey,
        model,
        sandboxName,
        policies,
        endpointUrl: endpointUrl || undefined,
      });
      setCompleted((prev) => new Set([...prev, 4]));
      setProvisioning(true);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start provisioning");
    }
  }

  function handleSuccess() {
    router.push(`/dashboard?sandbox=${encodeURIComponent(sandboxName)}`);
  }

  function handleRetry() {
    setProvisioning(false);
    setStep(0);
    setCompleted(new Set());
  }

  if (provisioning) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6 flex flex-col">
        <div className="flex-1 max-w-3xl mx-auto w-full">
          <ProvisioningView
            sandboxName={sandboxName}
            onSuccess={handleSuccess}
            onRetry={handleRetry}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Diffract Onboarding</h1>
        <p className="text-sm text-zinc-400">Set up your first AI sandbox</p>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left rail */}
        <div className="hidden sm:flex flex-col p-6 border-r border-zinc-800 w-56 shrink-0">
          <ProgressRail currentStep={step} completedSteps={completed} />
        </div>

        {/* Step panel */}
        <div className="flex-1 flex flex-col overflow-auto">
          <div className="flex-1 p-6 max-w-2xl">
            {step === 0 && (
              <StepProvider value={provider} onChange={setProvider} />
            )}
            {step === 1 && (
              <StepApiKey
                provider={provider}
                apiKey={apiKey}
                endpointUrl={endpointUrl}
                onChange={setApiKey}
                onEndpointChange={setEndpointUrl}
              />
            )}
            {step === 2 && (
              <StepModel provider={provider} value={model} onChange={setModel} />
            )}
            {step === 3 && (
              <StepSandbox
                value={sandboxName}
                onChange={setSandboxName}
                onConflict={setSandboxConflict}
              />
            )}
            {step === 4 && (
              <StepPolicies selected={policies} onChange={setPolicies} />
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-zinc-800 px-6 py-4 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 0}
            >
              Back
            </Button>

            <div className="flex items-center gap-3">
              {startError && (
                <p className="text-sm text-red-400">{startError}</p>
              )}

              {step < TOTAL_STEPS - 1 ? (
                <Button onClick={advance} disabled={!canAdvance()}>
                  Next
                </Button>
              ) : (
                <Button onClick={handleStart} disabled={!canAdvance()}>
                  Start provisioning
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
