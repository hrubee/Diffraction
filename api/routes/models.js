import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const router = Router();

function loadModels() {
  const builtIn = path.join(PROJECT_ROOT, "cli", "models.json");
  const userFile = path.join(
    process.env.HOME || "/root",
    ".diffract",
    "models.json"
  );

  let data = { models: [], providers: {}, defaults: {} };
  if (fs.existsSync(builtIn)) {
    data = JSON.parse(fs.readFileSync(builtIn, "utf-8"));
  }

  // Merge user models if they exist
  if (fs.existsSync(userFile)) {
    try {
      const user = JSON.parse(fs.readFileSync(userFile, "utf-8"));
      if (user.models) data.models = [...data.models, ...user.models];
      if (user.providers) data.providers = { ...data.providers, ...user.providers };
    } catch {}
  }

  return data;
}

/** Strip ANSI escape codes from CLI output. */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\[[?]?[0-9;]*[A-Za-z]/g, "");
}

/** Run an openshell CLI command and return stdout. Returns null on failure. */
function runOpenshell(args) {
  try {
    const out = execSync(
      `export PATH="$PATH:$HOME/.local/bin"; openshell ${args}`,
      { encoding: "utf-8", timeout: 15_000, shell: "/bin/bash" }
    );
    return stripAnsi(out);
  } catch {
    return null;
  }
}

/**
 * Parse `openshell inference get` output.
 * Expected output (after ANSI strip) is loosely:
 *   Provider: nvidia-nim
 *   Model:    meta/llama-3.1-8b-instruct
 * or similar key:value format.
 */
function parseInferenceGet(output) {
  if (!output) return { provider: null, model: null };
  const lines = output.split("\n");
  let provider = null;
  let model = null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("provider") && line.includes(":")) {
      provider = line.split(":").slice(1).join(":").trim() || null;
    }
    if (lower.includes("model") && line.includes(":")) {
      model = line.split(":").slice(1).join(":").trim() || null;
    }
  }
  return { provider, model };
}

// GET /api/models — list all models
router.get("/", (_req, res) => {
  try {
    const data = loadModels();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/models/active — get current inference provider + model
router.get("/active", (_req, res) => {
  const output = runOpenshell("inference get");
  if (output === null) {
    // CLI unavailable — return empty but not an error (dev environments without openshell)
    return res.json({ provider: null, model: null, available: false });
  }
  const parsed = parseInferenceGet(output);
  res.json({ ...parsed, available: true, raw: output.trim() });
});

// PUT /api/models/active — switch inference provider + model
// Body: { provider: string, model: string, sandbox?: string }
router.put("/active", (req, res) => {
  const { provider, model, sandbox } = req.body || {};

  if (!provider || !model) {
    return res.status(400).json({ error: "provider and model are required" });
  }

  // Sanitize inputs — only allow alphanumeric, dash, slash, dot, underscore
  const safe = /^[a-zA-Z0-9\-_./]+$/;
  if (!safe.test(provider) || !safe.test(model)) {
    return res.status(400).json({ error: "Invalid provider or model name" });
  }

  const sandboxFlag = sandbox && safe.test(sandbox) ? `--sandbox ${sandbox}` : "";
  const cmd = `inference set --provider ${provider} --model ${model} --no-verify ${sandboxFlag}`.trim();

  const output = runOpenshell(cmd);
  if (output === null) {
    return res.status(503).json({
      error: "openshell CLI unavailable — ensure it is installed at $HOME/.local/bin/openshell",
    });
  }

  // Verify the switch by reading back the active config
  const active = parseInferenceGet(runOpenshell("inference get") || "");

  res.json({
    switched: true,
    provider,
    model,
    active,
    raw: output.trim(),
  });
});

export default router;
