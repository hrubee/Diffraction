import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, "..", "gateway-token.json");

const router = Router();

/**
 * Dynamically fetch the gateway token from the sandbox if the static file
 * doesn't exist or is stale. Caches the result to the file for subsequent reads.
 */
function fetchTokenFromSandbox() {
  try {
    const output = execSync(
      `export PATH="$PATH:$HOME/.local/bin"; ` +
        `SANDBOX=$(openshell sandbox list 2>/dev/null | grep -oP '^\\S+' | grep -v NAME | head -1); ` +
        `[ -n "$SANDBOX" ] && openshell doctor exec -- kubectl exec -n openshell "$SANDBOX" -- ` +
        `python3 -c "import json; d=json.load(open('/sandbox/.openclaw/openclaw.json')); ` +
        `print(json.dumps({'token': d['gateway']['auth']['token'], 'sandbox': '$SANDBOX'}))"`,
      { encoding: "utf-8", timeout: 15000 }
    ).trim();
    if (output && output.startsWith("{")) {
      const data = JSON.parse(output);
      // Cache to file
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(data), "utf-8");
      return data;
    }
  } catch {
    // Fall through to file-based lookup
  }
  return null;
}

// GET /api/gateway-token — returns the OpenClaw gateway token
router.get("/", (_req, res) => {
  try {
    // Try static file first (fastest)
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
      if (data?.token) {
        res.json(data);
        return;
      }
    }

    // File missing or empty — fetch dynamically from sandbox
    const data = fetchTokenFromSandbox();
    if (data?.token) {
      res.json(data);
      return;
    }

    res.status(404).json({ error: "Token not found. No active sandbox with a gateway token." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
