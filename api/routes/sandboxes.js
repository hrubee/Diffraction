import { Router } from "express";
import { execSync } from "child_process";
import { readFile } from "fs/promises";
import { grpcCall } from "../lib/grpc-client.js";
import {
  createJob,
  updateJobStatus,
  getJobBySandbox,
  isJobRunning,
} from "../lib/jobs.js";

const router = Router();

/**
 * Map UI provider name to the value onboard.js getNonInteractiveProvider() accepts.
 * onboard.js only accepts: 'cloud' | 'ollama' | 'vllm' | 'nim'
 */
function mapProvider(uiProvider) {
  const cloud = new Set(["nvidia", "openai", "anthropic", "gemini", "cloud"]);
  if (cloud.has(uiProvider)) return "cloud";
  if (uiProvider === "ollama") return "ollama";
  if (uiProvider === "vllm") return "vllm";
  if (uiProvider === "nim") return "nim";
  return "cloud"; // safe default
}

/**
 * Load extra env vars from /root/.env if not already in process.env.
 * Returns an object of key->value pairs to merge.
 * Only loads NVIDIA_API_KEY and DIFFRACT_DOMAIN — nothing else.
 */
async function loadDotEnv() {
  const extras = {};
  const needed = ["NVIDIA_API_KEY", "DIFFRACT_DOMAIN"];
  // Skip loading file if all vars already present
  if (needed.every((k) => process.env[k])) return extras;
  try {
    const raw = await readFile("/root/.env", "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!needed.includes(key)) continue;
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      extras[key] = val;
    }
  } catch {
    // /root/.env absent on dev machines — not fatal
  }
  return extras;
}

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

// GET /api/sandboxes/:name/onboard-status — query job table, return liveness info.
// Shape is backwards-compatible with the old in-memory implementation.
router.get("/:name/onboard-status", async (req, res) => {
  const { name } = req.params;
  const job = getJobBySandbox(name);

  if (!job) {
    // No job record — fall back to log file for legacy runs
    const logFile = `/tmp/diffract-onboard-${name}.log`;
    let tail = [];
    try {
      const raw = await readFile(logFile, "utf-8");
      tail = raw.split("\n").slice(-100).filter(Boolean);
    } catch { /* log absent */ }
    return res.json({ active: false, exitCode: null, startedAt: null, elapsedMs: null, tail });
  }

  const active = job.status === "queued" || job.status === "running";
  const exitCode = job.exit_code ?? null;
  const startedAt = job.started_at ?? null;
  const elapsedMs = startedAt ? Date.now() - startedAt : null;

  // Read log tail
  let tail = [];
  if (job.log_path) {
    try {
      const raw = await readFile(job.log_path, "utf-8");
      tail = raw.split("\n").slice(-100).filter(Boolean);
    } catch { /* log not yet written */ }
  }

  res.json({ active, exitCode, startedAt, elapsedMs, tail });
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

// POST /api/sandboxes — create a new sandbox via diffract onboard (non-interactive)
// This runs the full 8-step onboard: gateway check, sandbox create, browser install,
// inference config, OpenClaw setup + gateway start, policy presets.
router.post("/", async (req, res) => {
  try {
    const { name, spec } = req.body;
    const sandboxName = (name || "my-assistant").trim();

    // Concurrency lock — reject duplicate in-flight onboards (worker pool concurrency=1)
    if (isJobRunning(sandboxName)) {
      const existing = getJobBySandbox(sandboxName);
      return res.status(409).json({
        error: `Sandbox '${sandboxName}' onboard already in progress`,
        startedAt: existing?.started_at ?? null,
        jobId: existing?.id ?? null,
      });
    }

    // Require NVIDIA API key from the form submission
    const nvidiaApiKey = spec?.nvidia_api_key?.trim();
    if (!nvidiaApiKey) {
      return res.status(400).json({ error: "NVIDIA API key is required." });
    }

    // Map UI provider name → onboard provider type
    const uiProvider = spec?.provider || "cloud";
    const provider = mapProvider(uiProvider);
    const model = spec?.model || "nvidia/nemotron-3-super-120b-a12b";

    // Load VPS env vars (DIFFRACT_DOMAIN only) — NVIDIA_API_KEY comes from form
    const dotEnv = await loadDotEnv();

    const envVars = {
      ...dotEnv,
      ...Object.fromEntries(
        ["DIFFRACT_DOMAIN"]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]])
      ),
      // Form-supplied key always wins — never fall back to /root/.env for this
      NVIDIA_API_KEY: nvidiaApiKey,
      DIFFRACTION_NON_INTERACTIVE: "1",
      DIFFRACTION_SANDBOX_NAME: sandboxName,
      DIFFRACTION_PROVIDER: provider,
      DIFFRACTION_MODEL: model,
    };

    // Policy presets — if UI sent any, enable custom mode
    const presets = Array.isArray(spec?.policy_presets) ? spec.policy_presets.filter(Boolean) : [];
    if (presets.length > 0) {
      envVars.DIFFRACTION_POLICY_MODE = "custom";
      envVars.DIFFRACTION_POLICY_PRESETS = presets.join(",");
    }

    // Build shell env prefix (values are shell-escaped, keys are validated above)
    const envPrefix = Object.entries(envVars)
      .map(([k, v]) => `${k}=${shellEscape(String(v))}`)
      .join(" ");

    const logFile = `/tmp/diffract-onboard-${sandboxName}.log`;

    // Create a durable job record before spawning
    const jobId = createJob(sandboxName, logFile);
    updateJobStatus(jobId, "running");

    // Correct VPS repo path: /root/.diffract/repo (not /root/diffract)
    const cmd = [
      `export PATH="$PATH:$HOME/.local/bin"`,
      `export NVM_DIR="$HOME/.nvm"`,
      `. "$NVM_DIR/nvm.sh"`,
      `cd /root/.diffract/repo`,
      `${envPrefix} DIFFRACTION_JOB_ID=${shellEscape(jobId)} node cli/bin/diffract.js onboard --non-interactive`,
    ].join(" && ");

    const { spawn: spawnProc } = await import("child_process");
    const child = spawnProc("bash", ["-c", `${cmd} > ${logFile} 2>&1`], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Update job when the child exits (best-effort — process may outlive the API)
    child.once("exit", (code) => {
      const finalStatus = code === 0 ? "done" : "failed";
      try { updateJobStatus(jobId, finalStatus, code); } catch { /* db may be unavailable */ }
    });

    res.status(202).json({
      name: sandboxName,
      status: "provisioning",
      message: "Sandbox creation started. This takes 3-5 minutes.",
      logFile,
      jobId,
      pid: child.pid,
    });
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
    const sandboxExec = (cmd) => {
      const b64 = Buffer.from(cmd).toString("base64");
      return `echo ${b64} | base64 -d | openshell sandbox connect ${JSON.stringify(name)}`;
    };

    // Step 1 — Find the gateway PID using /proc scanning
    let gatewyPid = null;
    try {
      const pidOutput = execSync(
        sandboxExec(`node -e "const fs=require('fs'); const files=fs.readdirSync('/proc').filter(f=>/^\\d+$/.test(f)); for(const p of files){try{const cmd=fs.readFileSync('/proc/'+p+'/cmdline','utf8'); if(cmd.includes('openclaw-gateway')){console.log(p);break;}}catch{}}"`) ,
        { encoding: "utf-8", timeout: 10000 }
      ).trim().replace(/\x1b\[[0-9;]*m/g, "");
      if (pidOutput && /^\d+$/.test(pidOutput)) {
        gatewyPid = pidOutput;
      }
    } catch {
      // process not found — that's OK, we'll start fresh
    }

    // Step 2 — Kill the gateway if found
    if (gatewyPid) {
      try {
        execSync(
          sandboxExec(`node -e "process.kill(${gatewyPid}, 9)"`),
          { encoding: "utf-8", timeout: 8000 }
        );
      } catch { /* already dead */ }
    }

    // Step 3 — Wait for the port to free
    await new Promise((r) => setTimeout(r, 3000));

    // Step 4 — Start gateway in background
    execSync(
      sandboxExec(`bash -c "nohup /usr/local/bin/diffract gateway > /tmp/gw.log 2>&1 &"`),
      { encoding: "utf-8", timeout: 10000 }
    );

    // Step 5 — Poll health for up to 30 seconds (15 × 2s)
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

/**
 * Shell-escape a value for safe inclusion in a bash env prefix.
 * Wraps in single quotes and escapes internal single quotes.
 */
function shellEscape(val) {
  return "'" + val.replace(/'/g, "'\\''") + "'";
}

export default router;
