import { Router } from "express";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// GET /api/config/gateway — gateway-global settings
router.get("/gateway", async (_req, res) => {
  try {
    const data = await grpcCall("GetGatewayConfig", {});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sandboxes/:name/config — sandbox settings
router.get("/sandbox/:name", async (req, res) => {
  try {
    // GetSandboxConfig requires sandbox_id (UUID), not name — resolve via GetSandbox first
    const sbData = await grpcCall("GetSandbox", { name: req.params.name });
    const sandbox = sbData.sandbox || sbData;
    if (!sandbox?.id) {
      res.status(404).json({ error: `Sandbox '${req.params.name}' not found` });
      return;
    }
    const data = await grpcCall("GetSandboxConfig", {
      sandbox_id: sandbox.id,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/config — update settings or policy (sandbox or global scope)
router.put("/", async (req, res) => {
  try {
    const data = await grpcCall("UpdateConfig", req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sandboxes/:name/policies — list policy history
router.get("/sandbox/:name/policies", async (req, res) => {
  try {
    const data = await grpcCall("ListSandboxPolicies", {
      name: req.params.name,
    });
    res.json({ policies: data.policies || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
