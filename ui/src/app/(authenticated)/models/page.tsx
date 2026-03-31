"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, Zap } from "lucide-react";

interface Model {
  id: string;
  label: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then(setModels).catch(() => {});
  }, []);

  async function handleSwitch(modelId: string) {
    setSwitching(modelId);
    try {
      const res = await fetch("/api/models/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        alert(`Switched to ${modelId}`);
      } else {
        const data = await res.json();
        alert(`Failed: ${data.error}`);
      }
    } catch {
      alert("Switch failed");
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Models</h1>
      <p className="text-muted-foreground">Select a model for inference. Switch takes effect immediately.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map((m) => (
          <Card key={m.id} className="hover:border-primary/50 transition-colors">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{m.id}</p>
                </div>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex gap-1 flex-wrap">
                <Badge variant="outline" className="text-xs">{m.provider}</Badge>
                {m.reasoning && <Badge variant="secondary" className="text-xs"><Zap className="h-3 w-3 mr-1" />reasoning</Badge>}
                <Badge variant="outline" className="text-xs">{(m.contextWindow / 1024).toFixed(0)}K ctx</Badge>
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
        ))}
      </div>
    </div>
  );
}
