import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, "..", "gateway-token.json");

const router = Router();

/**
 * Dynamically fetch the gateway token from the sandbox.
 */
function fetchTokenFromSandbox() {
  try {
    // Build the command to run inside the sandbox, base64-encoded to avoid quoting issues
    const innerCmd = `python3 -c "import json; d=json.load(open('/sandbox/.openclaw/openclaw.json')); print(d['gateway']['auth']['token'])"`;
    const cmdB64 = Buffer.from(innerCmd).toString("base64");
    const output = execSync(
      `export PATH="$PATH:$HOME/.local/bin"; ` +
        `SANDBOX=$(openshell sandbox list 2>/dev/null | grep -oP '^\\S+' | grep -v NAME | head -1); ` +
        `[ -n "$SANDBOX" ] && TOKEN=$(echo ${cmdB64} | base64 -d | openshell sandbox connect "$SANDBOX" 2>/dev/null | tail -1 | tr -d '\\r\\n') && ` +
        `echo "{\\"token\\":\\"$TOKEN\\",\\"sandbox\\":\\"$SANDBOX\\"}"`,
      { encoding: "utf-8", timeout: 15000 }
    ).trim();

    // Extract only the JSON line from output
    const lines = output.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const data = JSON.parse(trimmed);
          if (data.token && typeof data.token === "string" && data.token.length > 10) {
            // Cache to file
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(data), "utf-8");
            return data;
          }
        } catch { /* not valid JSON — skip */ }
      }
    }
  } catch {
    // Fall through to null
  }
  return null;
}

/**
 * Read and validate the cached token file.
 * Returns null if file is missing, corrupted, or contains garbage.
 */
function readCachedToken() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const data = JSON.parse(raw);
    // Validate: token must be a hex-like string, no newlines or stderr noise
    if (
      data?.token &&
      typeof data.token === "string" &&
      data.token.length > 10 &&
      !data.token.includes("\n") &&
      !data.token.includes("Defaulted")
    ) {
      return data;
    }
    // Corrupted — delete the file so it gets re-fetched
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    // Corrupted file — delete it
    try { fs.unlinkSync(TOKEN_FILE); } catch { /* ignore */ }
  }
  return null;
}

// GET /api/gateway-token — returns the OpenClaw gateway token
router.get("/", (_req, res) => {
  try {
    // Try cached file first (fastest)
    const cached = readCachedToken();
    if (cached) {
      res.json(cached);
      return;
    }

    // File missing or corrupted — fetch dynamically from sandbox
    const data = fetchTokenFromSandbox();
    if (data) {
      res.json(data);
      return;
    }

    res.status(404).json({ error: "Token not found. No active sandbox with a gateway token." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
