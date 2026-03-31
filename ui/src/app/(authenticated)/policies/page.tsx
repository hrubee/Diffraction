"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, ShieldCheck } from "lucide-react";

interface PolicyPreset {
  name: string;
  description: string;
  applied: boolean;
}

export default function PoliciesPage() {
  const [presets, setPresets] = useState<PolicyPreset[]>([]);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    loadPresets();
  }, []);

  async function loadPresets() {
    try {
      const res = await fetch("/api/sandboxes/my-assistant/policy");
      if (res.ok) setPresets(await res.json());
    } catch {}
  }

  async function handleApply(name: string) {
    setApplying(name);
    try {
      const res = await fetch("/api/sandboxes/my-assistant/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: name }),
      });
      if (res.ok) {
        await loadPresets();
      } else {
        const data = await res.json();
        alert(`Failed: ${data.error}`);
      }
    } catch {
      alert("Failed to apply policy");
    } finally {
      setApplying(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Network Policies</h1>
      <p className="text-muted-foreground">
        Control what external services the agent can access. Applied presets are enforced at the OS level.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((p) => (
          <Card key={p.name} className={p.applied ? "border-primary/50" : ""}>
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {p.applied ? (
                  <ShieldCheck className="h-5 w-5 text-primary" />
                ) : (
                  <Shield className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium capitalize">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
              </div>
              {p.applied ? (
                <Badge>Applied</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApply(p.name)}
                  disabled={applying === p.name}
                >
                  {applying === p.name ? "Applying..." : "Apply"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
