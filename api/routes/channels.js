// channels.js — Channel bridge management (Telegram, Discord, Slack, etc.)
// Tracks bridge processes via /tmp/diffract-channels.json

import { Router } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const router = Router();

// Project root — two levels up from api/routes/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../../");
const CHANNELS_FILE = "/tmp/diffract-channels.json";

// --- Persistence helpers ---

function loadChannels() {
  try {
    if (fs.existsSync(CHANNELS_FILE)) {
      return JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf8"));
    }
  } catch {
    // corrupted file — start fresh
  }
  return {};
}

function saveChannels(data) {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(data, null, 2), "utf8");
}

// --- Process liveness ---

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// --- Verification helpers ---

/** Verify a Telegram bot token by calling getMe */
async function verifyTelegramToken(token) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (!data.ok) return { valid: false, error: data.description || "Invalid token" };
    return { valid: true, bot: data.result };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/** Verify a sandbox exists and is ready via openshell CLI */
async function verifySandbox(name) {
  try {
    const { execSync } = await import("child_process");
    const output = execSync(
      `export PATH="$PATH:$HOME/.local/bin"; openshell sandbox list 2>/dev/null`,
      { encoding: "utf-8", timeout: 10000 }
    );
    // Strip ANSI codes and find the sandbox line
    const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
    const line = clean.split("\n").find((l) => l.trim().startsWith(name));
    if (!line) return { valid: false, error: `Sandbox '${name}' not found` };
    if (!line.includes("Ready")) {
      const phase = line.trim().split(/\s+/).pop() || "Unknown";
      return { valid: false, error: `Sandbox '${name}' is not ready (${phase})` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// --- Routes ---

// GET /api/channels — list all channels with live status
router.get("/", (_req, res) => {
  const stored = loadChannels();

  const channels = Object.entries(stored).map(([type, entry]) => {
    const running = isPidRunning(entry.pid);

    // If the process has died, clear the PID in storage so future reads are accurate
    if (entry.pid && !running) {
      stored[type] = { ...entry, pid: null, status: "stopped" };
    }

    return {
      type,
      status: running ? "running" : "stopped",
      sandbox: entry.sandbox || null,
      pid: running ? entry.pid : null,
      config: {
        hasToken: Boolean(entry.token),
        allowedChatIds: entry.allowedChatIds || [],
      },
    };
  });

  // Persist any status corrections made above
  saveChannels(stored);

  res.json({ channels });
});

// POST /api/channels/:type/start — start a channel bridge
router.post("/:type/start", async (req, res) => {
  const { type } = req.params;

  if (type !== "telegram") {
    return res
      .status(400)
      .json({ error: `Channel type '${type}' is not yet supported` });
  }

  const { sandbox, token, allowedChatIds } = req.body;

  if (!sandbox) return res.status(400).json({ error: "sandbox is required" });
  if (!token) return res.status(400).json({ error: "token is required" });

  // 1. Verify bot token with Telegram API
  const tokenCheck = await verifyTelegramToken(token);
  if (!tokenCheck.valid) {
    return res.status(400).json({
      error: `Invalid Telegram bot token: ${tokenCheck.error}`,
    });
  }

  // 2. Verify sandbox exists and is ready
  const sandboxCheck = await verifySandbox(sandbox);
  if (!sandboxCheck.valid) {
    return res.status(400).json({
      error: `Sandbox check failed: ${sandboxCheck.error}`,
    });
  }

  const stored = loadChannels();

  // Kill any existing process for this type before starting a new one
  if (stored[type]?.pid && isPidRunning(stored[type].pid)) {
    try {
      process.kill(stored[type].pid, "SIGTERM");
    } catch {
      // already dead
    }
  }

  const scriptPath = path.join(PROJECT_ROOT, "scripts", "telegram-bridge.js");

  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({
      error: `Bridge script not found at ${scriptPath}`,
    });
  }

  const env = {
    ...process.env,
    TELEGRAM_BOT_TOKEN: token,
    SANDBOX_NAME: sandbox,
  };

  if (allowedChatIds && allowedChatIds.length > 0) {
    env.ALLOWED_CHAT_IDS = Array.isArray(allowedChatIds)
      ? allowedChatIds.join(",")
      : String(allowedChatIds);
  }

  let child;
  try {
    child = spawn("node", [scriptPath], {
      env,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    return res.status(500).json({ error: `Failed to spawn bridge: ${err.message}` });
  }

  // Wait for the process to stabilize — catches early crashes (missing deps, bad config)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const alive = isPidRunning(child.pid);
  const status = alive ? "running" : "error";

  stored[type] = {
    pid: alive ? child.pid : null,
    sandbox,
    token,
    allowedChatIds: allowedChatIds || [],
    status,
    startedAt: new Date().toISOString(),
  };
  saveChannels(stored);

  if (!alive) {
    return res.status(500).json({
      error:
        "Bridge process exited immediately — check your TELEGRAM_BOT_TOKEN and SANDBOX_NAME",
    });
  }

  res.json({
    type,
    status,
    pid: child.pid,
    sandbox,
    bot: tokenCheck.bot ? `@${tokenCheck.bot.username}` : null,
  });
});

// POST /api/channels/:type/stop — stop a channel bridge
router.post("/:type/stop", (req, res) => {
  const { type } = req.params;
  const stored = loadChannels();
  const entry = stored[type];

  if (!entry) {
    return res.status(404).json({ error: `No channel of type '${type}' is configured` });
  }

  if (!entry.pid || !isPidRunning(entry.pid)) {
    stored[type] = { ...entry, pid: null, status: "stopped" };
    saveChannels(stored);
    return res.json({ type, status: "stopped" });
  }

  try {
    process.kill(entry.pid, "SIGTERM");
  } catch (err) {
    return res.status(500).json({ error: `Failed to stop bridge: ${err.message}` });
  }

  stored[type] = { ...entry, pid: null, status: "stopped" };
  saveChannels(stored);

  res.json({ type, status: "stopped" });
});

// PUT /api/channels/:type/config — update channel config without restarting
router.put("/:type/config", (req, res) => {
  const { type } = req.params;
  const stored = loadChannels();

  const existing = stored[type] || {};
  const updated = { ...existing };

  // Only update fields that are present in the body
  if (req.body.token !== undefined) updated.token = req.body.token;
  if (req.body.sandbox !== undefined) updated.sandbox = req.body.sandbox;
  if (req.body.allowedChatIds !== undefined) {
    updated.allowedChatIds = req.body.allowedChatIds;
  }

  stored[type] = updated;
  saveChannels(stored);

  const running = isPidRunning(updated.pid);

  res.json({
    type,
    status: running ? "running" : "stopped",
    config: {
      hasToken: Boolean(updated.token),
      allowedChatIds: updated.allowedChatIds || [],
    },
  });
});

export default router;
