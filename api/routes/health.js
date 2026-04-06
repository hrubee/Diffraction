import { Router } from "express";
import { execSync } from "child_process";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// GET /api/health — gateway health check
router.get("/", async (_req, res) => {
  try {
    const data = await grpcCall("Health", {});
    res.json({ status: data.status, version: data.version });
  } catch (err) {
    res.status(503).json({ status: "UNAVAILABLE", error: err.message });
  }
});

// GET /api/health/fleet — aggregated fleet status
router.get("/fleet", async (_req, res) => {
  try {
    // 1. Gateway health check
    let gateway_healthy = false;
    try {
      const health = await grpcCall("Health", {});
      gateway_healthy = health.status === "SERVICE_STATUS_HEALTHY";
    } catch {
      gateway_healthy = false;
    }

    // 2. List all sandboxes
    let sandboxList = [];
    try {
      const sandboxData = await grpcCall("ListSandboxes", { limit: 100, offset: 0 });
      sandboxList = (sandboxData.sandboxes || []).map((sb) => ({
        name: sb.name,
        phase: sb.phase,
        current_policy_version: sb.current_policy_version,
        created_at_ms: sb.created_at_ms,
      }));
    } catch {
      // Return empty list if gRPC fails
    }

    // 3. Get current inference config
    let inference = { provider: null, model: null };
    try {
      const raw = execSync(
        'export PATH="$PATH:$HOME/.local/bin"; openshell inference get 2>/dev/null',
        { encoding: "utf-8", timeout: 8000 }
      );
      const clean = raw.replace(/\x1b\[[0-9;]*m/g, "");
      const providerMatch = clean.match(/provider[:\s]+([^\s\n]+)/i);
      const modelMatch = clean.match(/model[:\s]+([^\s\n]+)/i);
      if (providerMatch) inference.provider = providerMatch[1];
      if (modelMatch) inference.model = modelMatch[1];
    } catch {
      // inference config not available
    }

    // 4. Get active port forwards
    const forwardedSandboxes = new Set();
    try {
      const fwRaw = execSync(
        'export PATH="$PATH:$HOME/.local/bin"; openshell forward list 2>/dev/null',
        { encoding: "utf-8", timeout: 8000 }
      );
      const fwClean = fwRaw.replace(/\x1b\[[0-9;]*m/g, "");
      for (const line of fwClean.split("\n")) {
        // Lines typically: <sandbox-name>  <local-port> -> <remote-port>
        const match = line.trim().match(/^(\S+)\s+\d+/);
        if (match) forwardedSandboxes.add(match[1]);
      }
    } catch {
      // forward list not available
    }

    // Annotate each sandbox with port forward status
    const sandboxes = sandboxList.map((sb) => ({
      ...sb,
      port_forward_active: forwardedSandboxes.has(sb.name),
    }));

    res.json({ sandboxes, inference, gateway_healthy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
