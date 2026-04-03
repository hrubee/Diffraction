import { Router } from "express";
import { execSync } from "child_process";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// GET /api/sandboxes — list all sandboxes
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const data = await grpcCall("ListSandboxes", { limit, offset });
    res.json({ sandboxes: data.sandboxes || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sandboxes/:name — get sandbox by name
router.get("/:name", async (req, res) => {
  try {
    const data = await grpcCall("GetSandbox", { name: req.params.name });
    res.json(data.sandbox || null);
  } catch (err) {
    if (err.message.includes("NOT_FOUND")) {
      res.status(404).json({ error: `Sandbox '${req.params.name}' not found` });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/sandboxes — create a new sandbox
router.post("/", async (req, res) => {
  try {
    const { name, spec } = req.body;
    const data = await grpcCall("CreateSandbox", { name, spec }, 60_000);
    res.status(201).json(data.sandbox || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sandboxes/:name — delete sandbox
router.delete("/:name", async (req, res) => {
  try {
    const data = await grpcCall("DeleteSandbox", { name: req.params.name });
    res.json({ deleted: data.deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sandboxes/:name/restart-gateway — restart OpenClaw gateway inside sandbox
router.post("/:name/restart-gateway", async (req, res) => {
  try {
    const name = req.params.name;
    const exec = `export PATH="$PATH:$HOME/.local/bin"; openshell doctor exec -- kubectl exec -n openshell ${name} --`;

    // Stop gateway
    try {
      execSync(`${exec} /usr/local/bin/diffract gateway stop`, {
        encoding: "utf-8", timeout: 15000,
      });
    } catch { /* may fail if not running */ }

    // Wait for port to free
    await new Promise((r) => setTimeout(r, 3000));

    // Start gateway (use `diffract gateway` not `gateway run` per instructions.md)
    execSync(
      `${exec} bash -c "nohup /usr/local/bin/diffract gateway > /tmp/gw.log 2>&1 &"`,
      { encoding: "utf-8", timeout: 10000 }
    );

    // Wait for health
    let healthy = false;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const check = execSync("curl -sf http://127.0.0.1:18789/health 2>/dev/null", {
          encoding: "utf-8", timeout: 5000,
        });
        if (check.includes("ok")) {
          healthy = true;
          break;
        }
      } catch { /* retry */ }
    }

    res.json({ restarted: true, healthy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
