// mcp.js — Zapier MCP integration management
// Handles Zapier MCP key storage, live tool listing, and sandbox sync.

import { Router } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

const router = Router();

const CREDENTIALS_PATH = path.join(os.homedir(), ".diffract", "credentials.json");

// --- Credentials helpers ---

function readCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
    }
  } catch {
    // corrupted or missing — start fresh
  }
  return {};
}

function writeCredentials(data) {
  const dir = path.dirname(CREDENTIALS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function getZapierKey() {
  const creds = readCredentials();
  return creds.ZAPIER_MCP_API_KEY || null;
}

// --- SSE / JSON response parser for Zapier MCP ---

/**
 * POST to the Zapier MCP endpoint and return parsed JSON-RPC result.
 * Handles both application/json and text/event-stream content types.
 */
async function queryZapierMcp(token, body) {
  const url = `https://mcp.zapier.com/api/v1/connect?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    // Accumulate SSE data lines until we find a valid JSON-RPC response
    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.result !== undefined || parsed.error !== undefined) {
            return parsed;
          }
        } catch {
          // not JSON — skip
        }
      }
    }
    throw new Error("No valid JSON-RPC response found in SSE stream");
  }

  // Standard JSON response
  if (!res.ok) {
    throw new Error(`Zapier MCP returned HTTP ${res.status}`);
  }
  return await res.json();
}

// --- Routes ---

// GET /api/mcp/zapier — configuration status
router.get("/zapier", async (_req, res) => {
  const key = getZapierKey();
  if (!key) {
    return res.json({ configured: false, toolCount: 0 });
  }

  // Attempt a live tool count; fall back gracefully if Zapier is unreachable
  try {
    const rpc = await queryZapierMcp(key, {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 1,
    });
    const tools = rpc?.result?.tools ?? [];
    return res.json({ configured: true, toolCount: tools.length });
  } catch {
    // Key is stored but we couldn't reach Zapier — still report configured
    return res.json({ configured: true, toolCount: null });
  }
});

// PUT /api/mcp/zapier — save/update Zapier API key
// Validates the key by calling tools/list before persisting.
router.put("/zapier", async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(400).json({ error: "apiKey is required" });
  }

  const key = apiKey.trim();

  // 1. Validate token is non-empty
  if (key.length < 10) {
    return res.status(400).json({
      error: "Invalid token. Paste the full token from mcp.zapier.com",
    });
  }

  // 2. Verify connection by calling tools/list
  try {
    const rpc = await queryZapierMcp(key, {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 1,
    });

    if (rpc.error) {
      return res.status(400).json({
        error: `Zapier rejected the key: ${rpc.error.message || "unknown error"}`,
      });
    }

    const tools = rpc?.result?.tools ?? [];

    // 3. Key is valid — save it
    const creds = readCredentials();
    creds.ZAPIER_MCP_API_KEY = key;
    writeCredentials(creds);

    res.json({ ok: true, verified: true, toolCount: tools.length });
  } catch (err) {
    return res.status(400).json({
      error: `Connection failed: ${err.message}. Check your API key and try again.`,
    });
  }
});

// DELETE /api/mcp/zapier — remove Zapier API key
router.delete("/zapier", (_req, res) => {
  const creds = readCredentials();
  delete creds.ZAPIER_MCP_API_KEY;
  writeCredentials(creds);
  res.json({ ok: true });
});

// GET /api/mcp/zapier/tools — fetch live tool list from Zapier MCP
router.get("/zapier/tools", async (req, res) => {
  const key = getZapierKey();
  if (!key) {
    return res.status(404).json({ error: "Zapier MCP is not configured" });
  }

  const page = Math.max(0, parseInt(req.query.page || "0", 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || "50", 10)));

  try {
    const rpc = await queryZapierMcp(key, {
      jsonrpc: "2.0",
      method: "tools/list",
      id: 1,
    });

    if (rpc.error) {
      return res.status(502).json({ error: rpc.error.message || "Zapier MCP error" });
    }

    const allTools = rpc?.result?.tools ?? [];
    const total = allTools.length;
    const start = page * limit;
    const tools = allTools.slice(start, start + limit);

    return res.json({ tools, total, page, limit });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

// POST /api/mcp/zapier/sync — push Zapier MCP config to all sandboxes
router.post("/zapier/sync", async (_req, res) => {
  const key = getZapierKey();
  if (!key) {
    return res.status(404).json({ error: "Zapier MCP is not configured" });
  }

  // Enumerate sandboxes via openshell CLI
  let sandboxNames = [];
  try {
    const output = execSync(
      `export PATH="$PATH:$HOME/.local/bin"; openshell sandbox list 2>/dev/null`,
      { encoding: "utf-8", timeout: 15000 }
    );
    // Strip ANSI codes and parse sandbox names from tabular output
    const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
    sandboxNames = clean
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("NAME") && !l.trim().startsWith("-"))
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch (err) {
    return res.status(500).json({ error: `Failed to list sandboxes: ${err.message}` });
  }

  if (sandboxNames.length === 0) {
    return res.json({ synced: [], skipped: [], errors: [] });
  }

  const mcpConfig = JSON.stringify({
    url: `https://mcp.zapier.com/api/v1/connect?token=${key}`,
    transport: "sse",
  });

  // 1. Apply Zapier network policy via the CLI's preset merge (not policy set, which replaces)
  //    Uses `diffract <sandbox> policy-add` or falls back to direct gRPC UpdateConfig.
  try {
    const { grpcCall } = await import("../lib/grpc-client.js");
    for (const name of sandboxNames) {
      // Get current policy
      const sbData = await grpcCall("GetSandbox", { name });
      const sandbox = sbData.sandbox || sbData;
      const policy = sandbox?.spec?.policy || {};
      const networkPolicies = policy.network_policies || {};

      // Add zapier_mcp rule if not already present
      if (!networkPolicies.zapier_mcp) {
        networkPolicies.zapier_mcp = {
          name: "zapier_mcp",
          endpoints: [{
            host: "mcp.zapier.com",
            port: 443,
            tls: "skip",
          }],
        };

        // Push updated policy
        await grpcCall("UpdateConfig", {
          name,
          policy: { ...policy, network_policies: networkPolicies },
        });
      }
    }
  } catch {
    // Non-fatal — network policy might fail but MCP config sync is the critical part
  }

  const synced = [];
  const errors = [];

  // 2. Push MCP config directly to openclaw.json
  //    Uses a python script written to a temp file to avoid shell escaping nightmares.
  const b64Config = Buffer.from(mcpConfig).toString("base64");

  // Write the merge script to a host-accessible temp file
  const mergeScript = `
import json, base64, sys
config_file = "/sandbox/.openclaw/openclaw.json"
mcp_b64 = sys.argv[1]
zapier_config = json.loads(base64.b64decode(mcp_b64).decode())
d = json.load(open(config_file))
if "mcp" not in d:
    d["mcp"] = {}
if "servers" not in d["mcp"]:
    d["mcp"]["servers"] = {}
d["mcp"]["servers"]["zapier"] = zapier_config
json.dump(d, open(config_file, "w"), indent=2)
print("ok")
`.trim();

  for (const name of sandboxNames) {
    try {
      const sandboxExec = (cmd) => {
        const b64 = Buffer.from(cmd).toString("base64");
        return `echo ${b64} | base64 -d | openshell sandbox connect ${JSON.stringify(name)}`;
      };

      // Write merge script to sandbox
      const b64Script = Buffer.from(mergeScript).toString("base64");
      execSync(
        sandboxExec(`bash -c "echo '${b64Script}' | base64 -d > /tmp/merge-mcp.py"`),
        { encoding: "utf-8", timeout: 10000 }
      );

      // Run the script with the config as argument
      execSync(
        sandboxExec(`python3 /tmp/merge-mcp.py "${b64Config}"`),
        { encoding: "utf-8", timeout: 15000 }
      );

      // Update hash + permissions
      execSync(
        sandboxExec(`bash -c "sha256sum /sandbox/.openclaw/openclaw.json > /sandbox/.openclaw/.config-hash && chown -R sandbox:sandbox /sandbox/.openclaw/"`),
        { encoding: "utf-8", timeout: 10000 }
      );

      synced.push(name);
    } catch (err) {
      errors.push({ name, error: err.message });
    }
  }

  return res.json({ synced, skipped: [], errors });
});

export default router;
