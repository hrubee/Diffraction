"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Zap, AlertCircle, CheckCircle2 } from "lucide-react";

interface Model {
  id: string;
  label: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

function ModelSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-4 rounded" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-8 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switchSuccess, setSwitchSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/models")
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((data) => {
        setModels(data);
        setError(null);
      })
      .catch(() => setError("Failed to load models"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSwitch(modelId: string) {
    setSwitching(modelId);
    setSwitchError(null);
    setSwitchSuccess(null);
    try {
      const res = await fetch("/api/models/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        setSwitchSuccess(modelId);
        setTimeout(() => setSwitchSuccess(null), 3000);
      } else {
        const data = await res.json();
        setSwitchError(data.error ?? `Failed to switch to ${modelId}`);
      }
    } catch {
      setSwitchError("Switch failed — check gateway connection");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Models</h1>
      <p className="text-muted-foreground">Select a model for inference. Switch takes effect immediately.</p>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {switchError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {switchError}
        </div>
      )}

      {switchSuccess && (
        <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Switched to {switchSuccess}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <ModelSkeleton />
            <ModelSkeleton />
            <ModelSkeleton />
          </>
        ) : (
          models.map((m) => (
            <Card key={m.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.label}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{m.id}</p>
                  </div>
                  <Cpu className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{m.provider}</Badge>
                  {m.reasoning && (
                    <Badge variant="secondary" className="text-xs">
                      <Zap className="h-3 w-3 mr-1" />reasoning
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {(m.contextWindow / 1024).toFixed(0)}K ctx
                  </Badge>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleSwitch(m.id)}
                  disabled={switching === m.id}
                >
                  {switching === m.id ? "Switching..." : "Switch to this model"}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {!loading && models.length === 0 && !error && (
        <p className="text-muted-foreground text-sm">No models available.</p>
      )}
    </div>
  );
}
