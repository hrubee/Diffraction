"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Puzzle, Trash2, Download } from "lucide-react";

interface Skill {
  name: string;
  hasSkillFile: boolean;
  installedAt: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installUrl, setInstallUrl] = useState("");
  const [installing, setInstalling] = useState(false);

  useEffect(() => { loadSkills(); }, []);

  async function loadSkills() {
    try {
      const res = await fetch("/api/hub");
      if (res.ok) setSkills(await res.json());
    } catch {}
  }

  async function handleInstall() {
    if (!installUrl.trim()) return;
    setInstalling(true);
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
        alert(`Failed: ${data.error}`);
      }
    } catch {
      alert("Install failed");
    } finally {
      setInstalling(false);
    }
  }

  async function handleRemove(name: string) {
    if (!confirm(`Remove skill '${name}'?`)) return;
    try {
      await fetch(`/api/hub/${name}`, { method: "DELETE" });
      await loadSkills();
    } catch {}
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Skills Hub</h1>
      <p className="text-muted-foreground">Install and manage agent skills from GitHub or local paths.</p>

      {/* Install form */}
      <div className="flex gap-2 max-w-lg">
        <Input
          placeholder="GitHub URL or local path..."
          value={installUrl}
          onChange={(e) => setInstallUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleInstall()}
        />
        <Button onClick={handleInstall} disabled={installing || !installUrl.trim()}>
          <Download className="h-4 w-4 mr-2" />
          {installing ? "Installing..." : "Install"}
        </Button>
      </div>

      {/* Installed skills */}
      <div className="space-y-3">
        {skills.map((s) => (
          <Card key={s.name}>
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Puzzle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Installed {new Date(s.installedAt).toLocaleDateString()}
                  </p>
                </div>
                {s.hasSkillFile && <Badge variant="outline" className="text-xs">SKILL.md</Badge>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleRemove(s.name)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {skills.length === 0 && (
          <p className="text-muted-foreground text-sm">No skills installed yet.</p>
        )}
      </div>
    </div>
  );
}
