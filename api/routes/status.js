// api/routes/status.js — Public system status endpoint (no auth required)
//
// GET /api/status → { hasCredentials: boolean, hasSandbox: boolean }
//
// hasCredentials: true when the admin credentials file exists (written by setup)
// hasSandbox:     true when at least one sandbox is registered in openshell

import fs from "fs";
import { spawnSync } from "child_process";
import { Router } from "express";

const CREDS_PATH =
  process.env.DIFFRACT_UI_CREDS_PATH || "/opt/diffract-ui/.credentials.json";

function hasCredentials() {
  try {
    return fs.existsSync(CREDS_PATH);
  } catch {
    return false;
  }
}

function hasSandbox() {
  try {
    const result = spawnSync("openshell", ["sandbox", "list"], {
      encoding: "utf-8",
      timeout: 8000,
      env: {
        ...process.env,
        PATH: `/root/.local/bin:/usr/local/bin:${process.env.PATH || "/usr/bin:/bin"}`,
      },
    });
    const stdout = result.stdout || "";
    const lines = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^(NAME|---|\s*$)/i.test(l));
    return lines.length > 0;
  } catch {
    return false;
  }
}

const router = Router();

router.get("/", (_req, res) => {
  res.json({ hasCredentials: hasCredentials(), hasSandbox: hasSandbox() });
});

export default router;
