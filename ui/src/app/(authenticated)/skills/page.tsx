"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Puzzle, Trash2, Download, AlertCircle } from "lucide-react";

interface Skill {
  name: string;
  hasSkillFile: boolean;
  installedAt: string;
}

function SkillSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-5 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded" />
      </CardContent>
    </Card>
  );
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hub");
      if (res.ok) {
        setSkills(await res.json());
      } else {
        setError("Failed to load skills");
      }
    } catch {
      setError("Failed to load skills");
    } finally {
      setLoading(false);
    }
  }

  async function handleInstall() {
    if (!installUrl.trim()) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await fetch("/api/hub/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: installUrl.trim() }),
      });
      if (res.ok) {
        setInstallUrl("");
        await loadSkills();
      } else {
        const data = await res.json();
        setInstallError(data.error ?? "Install failed");
      }
    } catch {
      setInstallError("Install failed — check the URL and try again");
    } finally {
      setInstalling(false);
    }
  }

  async function handleRemove(name: string) {
    if (!confirm(`Remove skill '${name}'?`)) return;
    setRemoveError(null);
    try {
      const res = await fetch(`/api/hub/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) {
        await loadSkills();
      } else {
        setRemoveError(`Failed to remove '${name}'`);
      }
    } catch {
      setRemoveError(`Failed to remove '${name}'`);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Skills Hub</h1>
      <p className="text-muted-foreground">Install and manage agent skills from GitHub or local paths.</p>

      {/* Install form */}
      <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
        <Input
          placeholder="GitHub URL or local path..."
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !installing && handleInstall()}
          className="flex-1"
        />
        <Button
          onClick={handleInstall}
          disabled={installing || !installUrl.trim()}
          className="shrink-0"
        >
          <Download className="h-4 w-4 mr-2" />
          {installing ? "Installing..." : "Install"}
        </Button>
      </div>

      {installError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-lg">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {installError}
        </div>
      )}

      {/* Global errors */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {removeError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {removeError}
        </div>
      )}

      {/* Installed skills */}
      <div className="space-y-3">
        {loading ? (
          <>
            <SkillSkeleton />
            <SkillSkeleton />
          </>
        ) : (
          <>
            {skills.map((s) => (
              <Card key={s.name}>
                <CardContent className="pt-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Puzzle className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Installed {new Date(s.installedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {s.hasSkillFile && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        SKILL.md
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => handleRemove(s.name)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {skills.length === 0 && !error && (
              <p className="text-muted-foreground text-sm">No skills installed yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
