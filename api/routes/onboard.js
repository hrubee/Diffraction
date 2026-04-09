// api/routes/onboard.js — Backend routes for the UI onboarding wizard.
//
// POST /api/onboard/start
//   Validate inputs, persist API key to ~/.diffract/credentials.json,
//   create a job row, spawn the non-interactive CLI onboard FSM, return jobId.
//
// GET  /api/onboard/status/:jobId
//   Thin wrapper over jobs.js getJobById.
//
// Live log streaming is handled by the existing GET /api/events?sandbox=<name> route.

import { Router } from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  createJob,
  updateJobStatus,
  isJobRunning,
  getJobById,
} from "../lib/jobs.js";
import { saveCredential, loadCredentials } from "../lib/credentials.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const router = Router();

// UI provider value → DIFFRACTION_PROVIDER env var (onboard.js internal key)
const PROVIDER_MAP = {
  "nvidia-nim": "cloud",
  "openai": "cloud",
  "anthropic": "cloud",
  "ollama": "ollama",
  "custom": "cloud",
};

// UI provider value → credential env var key stored in credentials.json
const CRED_KEY_MAP = {
  "nvidia-nim": "NVIDIA_API_KEY",
  "openai": "OPENAI_API_KEY",
  "anthropic": "ANTHROPIC_API_KEY",
  "ollama": null,
  "custom": "CUSTOM_API_KEY",
};

const VALID_PROVIDERS = new Set(Object.keys(PROVIDER_MAP));
// RFC1123 label: 3-32 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen
const SANDBOX_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

// POST /api/onboard/start
router.post("/start", (req, res) => {
  const { provider, apiKey, model, sandboxName, policies } = req.body;

  // ── 1. Validate ────────────────────────────────────────────────
  if (!sandboxName || !SANDBOX_NAME_RE.test(sandboxName)) {
    return res.status(400).json({
      error: "sandboxName must be 3-32 lowercase alphanumeric/hyphen characters, no leading or trailing hyphen",
    });
  }
  if (!provider || !VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({
      error: `provider must be one of: ${[...VALID_PROVIDERS].join(", ")}`,
    });
  }
  if (!model || typeof model !== "string" || !model.trim()) {
    return res.status(400).json({ error: "model is required" });
  }
  if (!Array.isArray(policies)) {
    return res.status(400).json({ error: "policies must be an array of strings" });
  }

  // ── 2. Concurrency guard (one job per sandbox) ─────────────────
  if (isJobRunning(sandboxName)) {
    return res.status(409).json({
      error: `An onboard job for sandbox '${sandboxName}' is already running`,
    });
  }

  // ── 3. Persist API key to credentials.json ────────────────────
  const credKey = CRED_KEY_MAP[provider];
  if (credKey && apiKey && typeof apiKey === "string" && apiKey.trim()) {
    saveCredential(credKey, apiKey.trim());
  }

  // ── 4. Create log file ────────────────────────────────────────
  const logsDir = path.join(homedir(), ".diffract", "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const timestamp = Date.now();
  const logPath = path.join(logsDir, `onboard-${sandboxName}-${timestamp}.log`);

  // ── 5. Create job row, mark running ───────────────────────────
  const jobId = createJob(sandboxName, logPath);
  updateJobStatus(jobId, "running");

  // ── 6. Build environment for spawned CLI ──────────────────────
  const savedCreds = loadCredentials();
  const env = {
    ...process.env,
    DIFFRACTION_NON_INTERACTIVE: "1",
    DIFFRACTION_JOB_ID: jobId,
    DIFFRACTION_PROVIDER: PROVIDER_MAP[provider],
    DIFFRACTION_MODEL: model.trim(),
    DIFFRACTION_SANDBOX_NAME: sandboxName,
    DIFFRACTION_RECREATE_SANDBOX: "0",
    DIFFRACTION_POLICY_MODE: policies.length > 0 ? "custom" : "suggested",
    DIFFRACTION_POLICY_PRESETS: policies.join(","),
    PATH: `/root/.local/bin:/usr/local/bin:${process.env.PATH || "/usr/bin:/bin"}`,
    HOME: process.env.HOME || homedir(),
  };

  // Inject all known API keys from persisted credentials so the CLI can read them
  for (const k of ["NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
    if (savedCreds[k]) env[k] = savedCreds[k];
  }

  // ── 7. Spawn CLI onboard (detached, non-blocking) ─────────────
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(
    process.execPath, // same node binary that's running the API
    [path.join(REPO_ROOT, "cli", "bin", "diffract.js"), "onboard", "--non-interactive"],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] }
  );

  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  child.on("exit", (code) => {
    logStream.end();
    const exitCode = typeof code === "number" ? code : 1;
    updateJobStatus(jobId, exitCode === 0 ? "done" : "failed", exitCode);
  });

  child.on("error", (err) => {
    logStream.write(`\n[spawn error] ${err.message}\n`);
    logStream.end();
    updateJobStatus(jobId, "failed", 1);
  });

  child.unref(); // don't hold the event loop

  // ── 8. Respond immediately ────────────────────────────────────
  return res.status(201).json({ jobId, sandboxName });
});

// GET /api/onboard/status/:jobId
router.get("/status/:jobId", (req, res) => {
  const job = getJobById(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  return res.json(job);
});

export default router;
