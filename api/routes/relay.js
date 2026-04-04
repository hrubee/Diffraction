// relay.js — Cross-sandbox relay routing
// Stores routing rules in ~/.diffract/relay-routes.json
// Forwards messages between sandbox gateways using openshell forward list for port discovery

import { Router } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const router = Router();

const DIFFRACT_DIR = path.join(os.homedir(), ".diffract");
const ROUTES_FILE = path.join(DIFFRACT_DIR, "relay-routes.json");

if (!fs.existsSync(DIFFRACT_DIR)) {
  fs.mkdirSync(DIFFRACT_DIR, { recursive: true, mode: 0o700 });
}

// --- Persistence ---

function loadRoutes() {
  try {
    if (fs.existsSync(ROUTES_FILE)) {
      return JSON.parse(fs.readFileSync(ROUTES_FILE, "utf8"));
    }
  } catch {
    // corrupted — start fresh
  }
  return { routes: [] };
}

function saveRoutes(data) {
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(data, null, 2), "utf8");
}

// --- Port discovery ---

/** Get sandbox → gateway port map from openshell forward list */
function getSandboxPorts() {
  try {
    const output = execSync(
      'export PATH="$PATH:$HOME/.local/bin"; openshell forward list 2>/dev/null',
      { encoding: "utf-8", timeout: 5000 }
    );
    const lines = output.split("\n").filter((l) => l.trim() && !l.startsWith("SANDBOX"));
    const map = {};
    for (const line of lines) {
      const cols = line.trim().split(/\s+/);
      const name = cols[0];
      const port = parseInt(cols[2], 10);
      const status = (cols[4] || "").replace(/\x1b\[[0-9;]*m/g, "");
      if (name && port && status === "running") {
        map[name] = port;
      }
    }
    return map;
  } catch {
    return {};
  }
}

// --- Routes ---

// GET /relay/routes — list all routing rules
router.get("/routes", (_req, res) => {
  const { routes } = loadRoutes();
  res.json({ routes });
});

// POST /relay/routes — create a routing rule
router.post("/routes", (req, res) => {
  const { from, to, description } = req.body;
  if (!from) return res.status(400).json({ error: "from sandbox is required" });
  if (!to) return res.status(400).json({ error: "to sandbox is required" });
  if (from === to) return res.status(400).json({ error: "from and to must be different sandboxes" });

  const data = loadRoutes();

  // Prevent duplicate routes
  const exists = data.routes.find((r) => r.from === from && r.to === to);
  if (exists) {
    return res.status(409).json({ error: `Route from '${from}' to '${to}' already exists`, route: exists });
  }

  const route = {
    id: randomUUID(),
    from,
    to,
    description: description || null,
    created: new Date().toISOString(),
    message_count: 0,
    last_used: null,
  };

  data.routes.push(route);
  saveRoutes(data);

  res.status(201).json({ route });
});

// DELETE /relay/routes/:id — remove a routing rule
router.delete("/routes/:id", (req, res) => {
  const data = loadRoutes();
  const idx = data.routes.findIndex((r) => r.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: `Route '${req.params.id}' not found` });
  }
  const [removed] = data.routes.splice(idx, 1);
  saveRoutes(data);
  res.json({ deleted: true, route: removed });
});

// POST /relay/send — forward a message from one sandbox to another
// Body: { from, to, message, endpoint? }
router.post("/send", async (req, res) => {
  const { from, to, message, endpoint = "/api/v1/chat/completions" } = req.body;
  if (!from) return res.status(400).json({ error: "from is required" });
  if (!to) return res.status(400).json({ error: "to is required" });
  if (!message) return res.status(400).json({ error: "message is required" });

  // Policy check: is this route allowed?
  const data = loadRoutes();
  const route = data.routes.find((r) => r.from === from && r.to === to);
  if (!route) {
    return res.status(403).json({
      error: `No relay route from '${from}' to '${to}'. Create one first.`,
    });
  }

  // Look up target sandbox port
  const ports = getSandboxPorts();
  const targetPort = ports[to];
  if (!targetPort) {
    return res.status(503).json({
      error: `Sandbox '${to}' has no active port forward. Start the gateway first.`,
    });
  }

  // Forward the request
  try {
    const targetUrl = `http://127.0.0.1:${targetPort}${endpoint}`;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.json().catch(() => ({}));

    // Update stats
    route.message_count = (route.message_count || 0) + 1;
    route.last_used = new Date().toISOString();
    saveRoutes(data);

    res.status(response.status).json({
      relayed: true,
      from,
      to,
      target_port: targetPort,
      response: body,
    });
  } catch (err) {
    res.status(502).json({ error: `Relay failed: ${err.message}` });
  }
});

// GET /relay/status — relay service health + sandbox port map
router.get("/status", (_req, res) => {
  const { routes } = loadRoutes();
  const ports = getSandboxPorts();
  res.json({
    ok: true,
    route_count: routes.length,
    active_sandboxes: Object.keys(ports),
    sandbox_ports: ports,
    routes: routes.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      description: r.description,
      message_count: r.message_count || 0,
      last_used: r.last_used,
      from_active: Boolean(ports[r.from]),
      to_active: Boolean(ports[r.to]),
    })),
  });
});

export default router;
