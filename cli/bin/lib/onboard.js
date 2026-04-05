// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Interactive onboarding wizard — 7 steps from zero to running sandbox.
// Supports non-interactive mode via --non-interactive flag or
// DIFFRACTION_NON_INTERACTIVE=1 env var for CI/CD pipelines.

const fs = require("fs");
const path = require("path");
const { ROOT, PROJECT_ROOT, SCRIPTS, run, runCapture } = require("./runner");
const {
  getDefaultOllamaModel,
  getLocalProviderBaseUrl,
  getOllamaModelOptions,
  getOllamaWarmupCommand,
  validateOllamaModel,
  validateLocalProvider,
} = require("./local-inference");
const {
  CLOUD_MODEL_OPTIONS,
  DEFAULT_CLOUD_MODEL,
  DEFAULT_OLLAMA_MODEL,
  getDiffractPrimaryModel,
  getProviderSelectionConfig,
} = require("./inference-config");
const {
  inferContainerRuntime,
  isUnsupportedMacosRuntime,
  shouldPatchCoredns,
} = require("./platform");
const { prompt, ensureApiKey, getCredential } = require("./credentials");
const registry = require("./registry");
const nim = require("./nim");
const policies = require("./policies");
const { checkPortAvailable, checkDiskSpace, checkMemory } = require("./preflight");
const session = require("./onboard-session");
const EXPERIMENTAL = process.env.DIFFRACTION_EXPERIMENTAL === "1";

// Non-interactive mode: set by --non-interactive flag or env var.
// When active, all prompts use env var overrides or sensible defaults.
let NON_INTERACTIVE = false;

function isNonInteractive() {
  return NON_INTERACTIVE;
}

// Prompt wrapper: returns env var value or default in non-interactive mode,
// otherwise prompts the user interactively.
async function promptOrDefault(question, envVar, defaultValue) {
  if (isNonInteractive()) {
    const val = envVar ? process.env[envVar] : null;
    const result = val || defaultValue;
    console.log(`  [non-interactive] ${question.trim()} → ${result}`);
    return result;
  }
  return prompt(question);
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Check if a sandbox is in Ready state from `openshell sandbox list` output.
 * Strips ANSI codes and exact-matches the sandbox name in the first column.
 */
function isSandboxReady(output, sandboxName) {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, "");
  return clean.split("\n").some((l) => {
    const cols = l.trim().split(/\s+/);
    return cols[0] === sandboxName && cols.includes("Ready") && !cols.includes("NotReady");
  });
}

/**
 * Determine whether stale Diffract gateway output indicates a previous
 * session that should be cleaned up before the port preflight check.
 * @param {string} gwInfoOutput - Raw output from `openshell gateway info -g diffract`.
 * @returns {boolean}
 */
function hasStaleGateway(gwInfoOutput) {
  return typeof gwInfoOutput === "string" && gwInfoOutput.length > 0 && gwInfoOutput.includes("diffract");
}

function step(n, total, msg) {
  console.log("");
  console.log(`  [${n}/${total}] ${msg}`);
  console.log(`  ${"─".repeat(50)}`);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function pythonLiteralJson(value) {
  return JSON.stringify(JSON.stringify(value));
}

function buildSandboxConfigSyncScript(selectionConfig) {
  const providerType =
    selectionConfig.profile === "inference-local"
      ? selectionConfig.model === DEFAULT_OLLAMA_MODEL
        ? "ollama-local"
        : "nvidia-nim"
      : selectionConfig.endpointType === "vllm"
        ? "vllm-local"
        : "nvidia-nim";
  const primaryModel = getDiffractPrimaryModel(providerType, selectionConfig.model);
  const providerKey = "inference";
  const providerConfig = {
    baseUrl: selectionConfig.endpointUrl,
    apiKey: "unused",
    api: "openai-completions",
    models: [
      {
        id: selectionConfig.model,
        name: selectionConfig.model,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 131072,
        maxTokens: 4096,
      },
    ],
  };
  return `
set -euo pipefail
mkdir -p ~/.diffract ~/.diffract
cat > ~/.diffract/config.json <<'EOF_DIFFRACTION_CFG'
${JSON.stringify(selectionConfig, null, 2)}
EOF_DIFFRACTION_CFG
python3 - <<'PYCFG'
import json
import os

cfg_path = os.path.expanduser('~/.diffract/diffract.json')
cfg = {}
if os.path.exists(cfg_path):
    with open(cfg_path) as f:
        cfg = json.load(f)

cfg.setdefault('agents', {}).setdefault('defaults', {}).setdefault('model', {})['primary'] = ${JSON.stringify(primaryModel)}
models_cfg = cfg.setdefault('models', {})
models_cfg.setdefault('mode', 'merge')
providers_cfg = models_cfg.setdefault('providers', {})
providers_cfg[${JSON.stringify(providerKey)}] = json.loads(${pythonLiteralJson(providerConfig)})

with open(cfg_path, 'w') as f:
    json.dump(cfg, f, indent=2)

os.chmod(cfg_path, 0o600)
PYCFG
openshell models set ${shellQuote(primaryModel)} > /dev/null 2>&1 || true
exit
`.trim();
}

async function promptCloudModel() {
  const modelRegistry = require("./model-registry");
  const models = modelRegistry.getCloudModels();

  console.log("");
  console.log("  Cloud models:");
  models.forEach((option, index) => {
    console.log(`    ${index + 1}) ${option.label} (${option.id})`);
  });
  console.log("");

  const choice = await prompt("  Choose model [1]: ");
  const index = parseInt(choice || "1", 10) - 1;
  return (models[index] || models[0]).id;
}

async function promptOllamaModel() {
  const options = getOllamaModelOptions(runCapture);
  const defaultModel = getDefaultOllamaModel(runCapture);
  const defaultIndex = Math.max(0, options.indexOf(defaultModel));

  console.log("");
  console.log("  Ollama models:");
  options.forEach((option, index) => {
    console.log(`    ${index + 1}) ${option}`);
  });
  console.log("");

  const choice = await prompt(`  Choose model [${defaultIndex + 1}]: `);
  const index = parseInt(choice || String(defaultIndex + 1), 10) - 1;
  return options[index] || options[defaultIndex] || defaultModel;
}

function isDockerInstalled() {
  try {
    runCapture("which docker", { ignoreError: false });
    return true;
  } catch {
    return false;
  }
}

function isDockerRunning() {
  try {
    runCapture("docker info", { ignoreError: false });
    return true;
  } catch {
    return false;
  }
}

function detectPlatform() {
  const platform = process.platform; // darwin, linux, win32
  const arch = process.arch; // arm64, x64
  return { platform, arch };
}

async function installDocker() {
  const { platform, arch } = detectPlatform();

  if (platform === "darwin") {
    // macOS — try brew first, then direct download
    const hasBrew = runCapture("which brew", { ignoreError: true });
    if (hasBrew) {
      console.log("  Installing Docker Desktop via Homebrew...");
      // Remove stale binaries that block cask install
      run("sudo rm -f /usr/local/bin/hub-tool /usr/local/bin/kubectl.docker 2>/dev/null || true", { ignoreError: true });
      try {
        run("brew install --cask docker-desktop", { stdio: "inherit" });
        console.log("  Starting Docker Desktop...");
        run("open -a Docker");
        return waitForDocker();
      } catch {
        console.log("  Homebrew install failed. Trying direct download...");
      }
    }
    // Direct DMG download
    const dmgUrl = arch === "arm64"
      ? "https://desktop.docker.com/mac/main/arm64/Docker.dmg"
      : "https://desktop.docker.com/mac/main/amd64/Docker.dmg";
    const dmgPath = "/tmp/Docker.dmg";
    console.log("  Downloading Docker Desktop...");
    run(`curl -fsSL -o "${dmgPath}" "${dmgUrl}"`, { stdio: "inherit" });
    console.log("  Installing Docker Desktop...");
    run(`hdiutil attach "${dmgPath}" -quiet`);
    run('cp -R "/Volumes/Docker/Docker.app" /Applications/');
    run(`hdiutil detach "/Volumes/Docker" -quiet`);
    run(`rm -f "${dmgPath}"`);
    console.log("  Starting Docker Desktop...");
    run("open -a Docker");
    return waitForDocker();

  } else if (platform === "linux") {
    console.log("  Installing Docker via official script...");
    run("curl -fsSL https://get.docker.com | sh", { stdio: "inherit" });
    // Add current user to docker group
    const user = runCapture("whoami", { ignoreError: true });
    if (user) {
      run(`sudo usermod -aG docker ${user}`, { ignoreError: true });
    }
    // Fix cgroup v2 for Ubuntu 24.04+ (required by OpenShell)
    console.log("  Configuring Docker cgroup settings...");
    run(`echo '{"default-cgroupns-mode": "host"}' | sudo tee /etc/docker/daemon.json > /dev/null`, { ignoreError: true });
    run("sudo systemctl enable docker", { ignoreError: true });
    run("sudo systemctl restart docker", { ignoreError: true });
    return waitForDocker();

  } else {
    console.error("  Automatic Docker install is not supported on this platform.");
    console.error("  Install Docker manually: https://docs.docker.com/get-docker/");
    return false;
  }
}

function waitForDocker() {
  console.log("  Waiting for Docker to start...");
  const maxWait = 120; // seconds
  for (let i = 0; i < maxWait; i += 3) {
    if (isDockerRunning()) {
      return true;
    }
    runCapture("sleep 3", { ignoreError: true });
    if (i % 15 === 0 && i > 0) {
      console.log(`  Still waiting for Docker... (${i}s)`);
    }
  }
  console.error("  Docker did not start within 2 minutes.");
  return false;
}

function getContainerRuntime() {
  const info = runCapture("docker info 2>/dev/null", { ignoreError: true });
  return inferContainerRuntime(info);
}

function isOpenshellInstalled() {
  try {
    runCapture("command -v openshell");
    return true;
  } catch {
    return false;
  }
}

function installOpenshell() {
  console.log("  Installing diffract CLI...");
  run(`bash "${path.join(SCRIPTS, "install-openshell.sh")}"`, { ignoreError: true });
  const localBin = process.env.XDG_BIN_HOME || path.join(process.env.HOME || "", ".local", "bin");
  if (fs.existsSync(path.join(localBin, "diffract")) && !process.env.PATH.split(path.delimiter).includes(localBin)) {
    process.env.PATH = `${localBin}${path.delimiter}${process.env.PATH}`;
  }
  return isOpenshellInstalled();
}

function sleep(seconds) {
  require("child_process").spawnSync("sleep", [String(seconds)]);
}

function waitForSandboxReady(sandboxName, attempts = 10, delaySeconds = 2) {
  for (let i = 0; i < attempts; i += 1) {
    const exists = runCapture(`openshell sandbox get "${sandboxName}" 2>/dev/null`, { ignoreError: true });
    if (exists) return true;
    sleep(delaySeconds);
  }
  return false;
}

function parsePolicyPresetEnv(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isSafeModelId(value) {
  return /^[A-Za-z0-9._:/-]+$/.test(value);
}

function getNonInteractiveProvider() {
  const providerKey = (process.env.DIFFRACTION_PROVIDER || "").trim().toLowerCase();
  if (!providerKey) return null;

  const validProviders = new Set(["cloud", "ollama", "vllm", "nim"]);
  if (!validProviders.has(providerKey)) {
    console.error(`  Unsupported DIFFRACTION_PROVIDER: ${providerKey}`);
    console.error("  Valid values: cloud, ollama, vllm, nim");
    process.exit(1);
  }

  return providerKey;
}

function getNonInteractiveModel(providerKey) {
  const model = (process.env.DIFFRACTION_MODEL || "").trim();
  if (!model) return null;
  if (!isSafeModelId(model)) {
    console.error(`  Invalid DIFFRACTION_MODEL for provider '${providerKey}': ${model}`);
    console.error("  Model values may only contain letters, numbers, '.', '_', ':', '/', and '-'.");
    process.exit(1);
  }
  return model;
}

// ── Step 1: Preflight ────────────────────────────────────────────

async function preflight() {
  step(1, 8, "Preflight checks (Docker, CLI, ports)");

  // Docker — auto-install if missing, auto-start if not running
  if (!isDockerInstalled()) {
    console.log("  Docker not found. Installing...");
    const installed = await installDocker();
    if (!installed) {
      console.error("  Failed to install Docker. Install manually: https://docs.docker.com/get-docker/");
      process.exit(1);
    }
  } else if (!isDockerRunning()) {
    // Docker is installed but not running — try to start it
    const { platform } = detectPlatform();
    if (platform === "darwin") {
      console.log("  Docker is installed but not running. Starting Docker Desktop...");
      run("open -a Docker", { ignoreError: true });
    } else {
      console.log("  Docker is installed but not running. Starting Docker...");
      run("sudo systemctl start docker", { ignoreError: true });
    }
    if (!waitForDocker()) {
      console.error("  Could not start Docker. Please start it manually and try again.");
      process.exit(1);
    }
  }
  console.log("  ✓ Docker is running");

  // Ensure cgroup v2 fix is applied (required by OpenShell on Ubuntu 24.04+)
  if (process.platform === "linux") {
    try {
      const daemonJson = runCapture("cat /etc/docker/daemon.json 2>/dev/null", { ignoreError: true });
      if (!daemonJson || !daemonJson.includes("cgroupns")) {
        console.log("  Applying cgroup v2 fix for OpenShell...");
        run(`echo '{"default-cgroupns-mode": "host"}' | sudo tee /etc/docker/daemon.json > /dev/null`, { ignoreError: true });
        run("sudo systemctl restart docker", { ignoreError: true });
        waitForDocker();
      }
    } catch { /* non-fatal */ }
  }

  const runtime = getContainerRuntime();
  if (isUnsupportedMacosRuntime(runtime)) {
    console.error("  Podman on macOS is not supported by Diffract at this time.");
    console.error("  Diffract currently depends on Docker host-gateway behavior that Podman on macOS does not provide.");
    console.error("  Use Colima or Docker Desktop on macOS instead.");
    process.exit(1);
  }
  if (runtime !== "unknown") {
    console.log(`  ✓ Container runtime: ${runtime}`);
  }

  // Diffract CLI
  if (!isOpenshellInstalled()) {
    console.log("  diffract CLI not found. Attempting to install...");
    if (!installOpenshell()) {
      console.error("  Failed to install diffract CLI.");
      console.error("  Install manually: https://github.com/NVIDIA/Diffract/releases");
      process.exit(1);
    }
  }
  console.log(`  ✓ diffract CLI: ${runCapture("openshell --version 2>/dev/null || echo unknown", { ignoreError: true })}`);

  // Clean up stale Diffract session before checking ports.
  // A previous onboard run may have left the gateway container and port
  // forward running.  If a Diffract-owned gateway is still present, tear
  // it down so the port check below doesn't fail on our own leftovers.
  const gwInfo = runCapture("openshell gateway info -g diffract 2>/dev/null", { ignoreError: true });
  if (hasStaleGateway(gwInfo)) {
    console.log("  Cleaning up previous Diffract session...");
    run("openshell forward stop 18789 2>/dev/null || true", { ignoreError: true });
    run("openshell gateway destroy -g diffract 2>/dev/null || true", { ignoreError: true });
    console.log("  ✓ Previous session cleaned up");
  }

  // Required ports — gateway (8080) and dashboard (18789)
  const requiredPorts = [
    { port: 8080, label: "Diffract gateway" },
    { port: 18789, label: "Diffract dashboard" },
  ];
  for (const { port, label } of requiredPorts) {
    const portCheck = await checkPortAvailable(port);
    if (!portCheck.ok) {
      console.error("");
      console.error(`  !! Port ${port} is not available.`);
      console.error(`     ${label} needs this port.`);
      console.error("");
      if (portCheck.process && portCheck.process !== "unknown") {
        console.error(`     Blocked by: ${portCheck.process}${portCheck.pid ? ` (PID ${portCheck.pid})` : ""}`);
        console.error("");
        console.error("     To fix, stop the conflicting process:");
        console.error("");
        if (portCheck.pid) {
          console.error(`       sudo kill ${portCheck.pid}`);
        } else {
          console.error(`       lsof -i :${port} -sTCP:LISTEN -P -n`);
        }
        console.error("       # or, if it's a systemd service:");
        console.error("       systemctl --user stop diffract-gateway.service");
      } else {
        console.error(`     Could not identify the process using port ${port}.`);
        console.error(`     Run: lsof -i :${port} -sTCP:LISTEN`);
      }
      console.error("");
      console.error(`     Detail: ${portCheck.reason}`);
      process.exit(1);
    }
    console.log(`  ✓ Port ${port} available (${label})`);
  }

  // Disk space (need ~5GB for container images)
  const diskCheck = checkDiskSpace("/", 5);
  if (!diskCheck.ok) {
    console.error(`  !! ${diskCheck.reason}`);
    process.exit(1);
  }
  if (diskCheck.availableGB !== null) {
    console.log(`  ✓ Disk space: ${diskCheck.availableGB}GB available`);
  }

  // Memory (need ~2GB)
  const memCheck = checkMemory(2048);
  if (!memCheck.ok) {
    console.error(`  !! ${memCheck.reason}`);
    process.exit(1);
  }
  if (memCheck.availableMB !== null) {
    console.log(`  ✓ Memory: ${memCheck.availableMB}MB available`);
  }

  // GPU
  const gpu = nim.detectGpu();
  if (gpu && gpu.type === "nvidia") {
    console.log(`  ✓ NVIDIA GPU detected: ${gpu.count} GPU(s), ${gpu.totalMemoryMB} MB VRAM`);
  } else if (gpu && gpu.type === "apple") {
    console.log(`  ✓ Apple GPU detected: ${gpu.name}${gpu.cores ? ` (${gpu.cores} cores)` : ""}, ${gpu.totalMemoryMB} MB unified memory`);
    console.log("  ⓘ NIM requires NVIDIA GPU — will use cloud inference");
  } else {
    console.log("  ⓘ No GPU detected — will use cloud inference");
  }

  return gpu;
}

// ── Step 2: Gateway ──────────────────────────────────────────────

async function startGateway(gpu) {
  step(2, 8, "Starting Diffract gateway");

  // Destroy old gateway
  run("openshell gateway destroy -g diffract 2>/dev/null || true", { ignoreError: true });

  const gwArgs = ["--name", "diffract"];
  // Do NOT pass --gpu here. On DGX Spark (and most GPU hosts), inference is
  // routed through a host-side provider (Ollama, vLLM, or cloud API) — the
  // sandbox itself does not need direct GPU access. Passing --gpu causes
  // FailedPrecondition errors when the gateway's k3s device plugin cannot
  // allocate GPUs. See: https://build.nvidia.com/spark/diffract/instructions

  run(`openshell gateway start ${gwArgs.join(" ")}`, { ignoreError: false });

  // Verify health
  for (let i = 0; i < 5; i++) {
    const status = runCapture("openshell status 2>&1", { ignoreError: true });
    if (status.includes("Connected")) {
      console.log("  ✓ Gateway is healthy");
      break;
    }
    if (i === 4) {
      console.error("  Gateway failed to start. Run: openshell gateway info");
      process.exit(1);
    }
    sleep(2);
  }

  // CoreDNS fix — always run. k3s-inside-Docker has broken DNS on all platforms.
  const runtime = getContainerRuntime();
  if (shouldPatchCoredns(runtime)) {
    console.log("  Patching CoreDNS for Colima...");
    run(`bash "${path.join(SCRIPTS, "fix-coredns.sh")}" diffract 2>&1 || true`, { ignoreError: true });
  }
  // Give DNS a moment to propagate
  sleep(5);
}

// ── Step 3: Sandbox ──────────────────────────────────────────────

async function createSandbox(gpu) {
  step(5, 8, "Creating sandbox");

  let sandboxName;
  while (true) {
    const nameAnswer = await promptOrDefault(
      "  Sandbox name (lowercase, numbers, hyphens) [my-assistant]: ",
      "DIFFRACTION_SANDBOX_NAME", "my-assistant"
    );
    sandboxName = (nameAnswer || "my-assistant").trim().toLowerCase().replace(/\s+/g, "-");

    // Validate: RFC 1123 subdomain — lowercase alphanumeric and hyphens,
    // must start and end with alphanumeric (required by Kubernetes/Diffract)
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sandboxName)) {
      break;
    }
    console.error(`  Invalid sandbox name: '${sandboxName}'`);
    console.error("  Names must be lowercase, contain only letters, numbers, and hyphens,");
    console.error("  and must start and end with a letter or number.");
    if (isNonInteractive()) {
      process.exit(1);
    }
    console.log("  Please try again.\n");
  }

  // Check if sandbox already exists in registry
  const existing = registry.getSandbox(sandboxName);
  if (existing) {
    if (isNonInteractive()) {
      if (process.env.DIFFRACTION_RECREATE_SANDBOX !== "1") {
        console.error(`  Sandbox '${sandboxName}' already exists.`);
        console.error("  Set DIFFRACTION_RECREATE_SANDBOX=1 to recreate it in non-interactive mode.");
        process.exit(1);
      }
      console.log(`  [non-interactive] Sandbox '${sandboxName}' exists — recreating`);
    } else {
      const recreate = await prompt(`  Sandbox '${sandboxName}' already exists. Recreate? [y/N]: `);
      if (recreate.toLowerCase() !== "y") {
        console.log("  Keeping existing sandbox.");
        return sandboxName;
      }
    }
    // Destroy old sandbox
    run(`openshell sandbox delete "${sandboxName}" 2>/dev/null || true`, { ignoreError: true });
    registry.removeSandbox(sandboxName);
  }

  // Stage build context
  const { mkdtempSync } = require("fs");
  const os = require("os");
  const buildCtx = fs.mkdtempSync(path.join(os.tmpdir(), "diffract-build-"));
  fs.copyFileSync(path.join(ROOT, "Dockerfile"), path.join(buildCtx, "Dockerfile"));
  run(`cp -r "${path.join(PROJECT_ROOT, "plugins", "diffract-core")}" "${buildCtx}/diffract"`);
  run(`cp -r "${path.join(PROJECT_ROOT, "policies")}" "${buildCtx}/policies"`);
  run(`cp -r "${path.join(PROJECT_ROOT, "blueprints")}" "${buildCtx}/blueprints"`);
  run(`cp -r "${path.join(PROJECT_ROOT, "scripts")}" "${buildCtx}/scripts"`);
  run(`rm -rf "${buildCtx}/diffract/node_modules" "${buildCtx}/diffract/src"`, { ignoreError: true });

  // Create sandbox (use -- echo to avoid dropping into interactive shell)
  // Pass the base policy so sandbox starts in proxy mode (required for policy updates later)
  const basePolicyPath = path.join(PROJECT_ROOT, "policies", "base.yaml");
  const createArgs = [
    `--from "${buildCtx}/Dockerfile"`,
    `--name "${sandboxName}"`,
    `--policy "${basePolicyPath}"`,
  ];
  // --gpu is intentionally omitted. See comment in startGateway().

  // Inject build args into Dockerfile
  const dockerfilePath = path.join(buildCtx, "Dockerfile");
  let df = fs.readFileSync(dockerfilePath, "utf-8");

  // OpenClaw version: use latest by default, or env override
  const openclawVersion = process.env.OPENCLAW_VERSION || "latest";
  df = df.replace(
    /^ARG OPENCLAW_VERSION=.*/m,
    `ARG OPENCLAW_VERSION=${openclawVersion}`
  );
  if (openclawVersion === "latest") {
    console.log("  Using latest OpenClaw version");
  } else {
    console.log(`  Using OpenClaw version: ${openclawVersion}`);
  }

  // Chat UI URL for allowedOrigins
  const chatUiUrl = process.env.CHAT_UI_URL || 'http://127.0.0.1:18789';
  if (chatUiUrl !== 'http://127.0.0.1:18789') {
    df = df.replace(
      /^ARG CHAT_UI_URL=.*/m,
      `ARG CHAT_UI_URL=${chatUiUrl}`
    );
  }

  fs.writeFileSync(dockerfilePath, df);

  console.log(`  Creating sandbox '${sandboxName}' (this takes a few minutes on first run)...`);
  const envArgs = [`CHAT_UI_URL=${chatUiUrl}`];
  if (process.env.NVIDIA_API_KEY) {
    envArgs.push(`NVIDIA_API_KEY=${process.env.NVIDIA_API_KEY}`);
  }

  // Run without piping through awk — the pipe masked non-zero exit codes
  // from diffract because bash returns the status of the last pipeline
  // command (awk, always 0) unless pipefail is set. Removing the pipe
  // lets the real exit code flow through to run().
  const createResult = run(
    `openshell sandbox create ${createArgs.join(" ")} -- env ${envArgs.join(" ")} diffract 2>&1`,
    { ignoreError: true }
  );

  // Clean up build context regardless of outcome
  run(`rm -rf "${buildCtx}"`, { ignoreError: true });

  if (createResult.status !== 0) {
    console.error("");
    console.error(`  Sandbox creation failed (exit ${createResult.status}).`);
    console.error("  Try:  openshell sandbox list        # check gateway state");
    console.error("  Try:  diffract onboard              # retry from scratch");
    process.exit(createResult.status || 1);
  }

  // Wait for sandbox to reach Ready state in k3s before registering.
  // On WSL2 + Docker Desktop the pod can take longer to initialize;
  // without this gate, Diffract registers a phantom sandbox that
  // causes "sandbox not found" on every subsequent connect/status call.
  console.log("  Waiting for sandbox to become ready...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const list = runCapture("openshell sandbox list 2>&1", { ignoreError: true });
    if (isSandboxReady(list, sandboxName)) {
      ready = true;
      break;
    }
    require("child_process").spawnSync("sleep", ["2"]);
  }

  if (!ready) {
    // Clean up the orphaned sandbox so the next onboard retry with the same
    // name doesn't fail on "sandbox already exists".
    const delResult = run(`openshell sandbox delete "${sandboxName}" 2>/dev/null || true`, { ignoreError: true });
    console.error("");
    console.error(`  Sandbox '${sandboxName}' was created but did not become ready within 60s.`);
    if (delResult.status === 0) {
      console.error("  The orphaned sandbox has been removed — you can safely retry.");
    } else {
      console.error(`  Could not remove the orphaned sandbox. Manual cleanup:`);
      console.error(`    openshell sandbox delete "${sandboxName}"`);
    }
    console.error("  Retry: diffract onboard");
    process.exit(1);
  }

  // Set up DNS proxy so inference.local resolves inside the sandbox namespace.
  // Without this, the L7 proxy at 10.200.0.1:3128 is unreachable by DNS.
  run(`bash "${path.join(SCRIPTS, "fix-coredns.sh")}" diffract 2>&1 || true`, { ignoreError: true });
  run(`bash "${path.join(SCRIPTS, "setup-dns-proxy.sh")}" diffract "${sandboxName}" 2>&1 || true`, { ignoreError: true });

  // Release any stale forward on port 18789 before claiming it for the new sandbox.
  // A previous onboard run may have left the port forwarded to a different sandbox,
  // which would silently prevent the new sandbox's dashboard from being reachable.
  run(`openshell forward stop 18789 2>/dev/null || true`, { ignoreError: true });
  // Forward dashboard port to the new sandbox
  run(`openshell forward start --background 18789 "${sandboxName}"`, { ignoreError: true });

  // Register only after confirmed ready — prevents phantom entries
  registry.registerSandbox({
    name: sandboxName,
    gpuEnabled: !!gpu,
  });

  console.log(`  ✓ Sandbox '${sandboxName}' created`);
  return sandboxName;
}

// ── Step 3.5: Browser install ────────────────────────────────────

async function installBrowser(sandboxName) {
  step(6, 8, "Installing browser in sandbox");

  const sandboxExec = (cmd) => {
    const b64 = Buffer.from(cmd).toString("base64");
    return `echo ${b64} | base64 -d | openshell sandbox connect ${JSON.stringify(sandboxName)}`;
  };

  try {
    // 1. Install Playwright + Chromium headless shell (real binary, not Ubuntu snap stub)
    console.log("  Installing Chromium via Playwright (this may take a minute)...");
    runCapture(sandboxExec(`npx --yes playwright install chromium 2>&1`), { ignoreError: false });

    // 2. Install system dependencies (libgbm, xvfb, fonts, etc.)
    console.log("  Installing browser system dependencies...");
    runCapture(sandboxExec(`npx playwright install-deps chromium 2>&1`), { ignoreError: false });

    // 3. Copy headless shell to an accessible location (/opt/chromium-headless)
    //    Playwright installs to /root/.cache which the sandbox user can't access (drwx------).
    console.log("  Setting up browser for sandbox user...");
    const findResult = runCapture(
      sandboxExec(`find /root/.cache/ms-playwright -name "chrome-headless-shell" -type f 2>/dev/null`),
      { ignoreError: true }
    );
    const headlessPath = (findResult || "").trim().split("\n")[0];
    if (!headlessPath) {
      // Fallback: try full chromium
      const chromePath = runCapture(
        sandboxExec(`find /root/.cache/ms-playwright -name "chrome" -type f -not -path "*/headless*" 2>/dev/null`),
        { ignoreError: true }
      );
      if (chromePath && chromePath.trim()) {
        const chromeDir = path.dirname(chromePath.trim().split("\n")[0]);
        runCapture(sandboxExec(`bash -c "cp -r ${chromeDir} /opt/chromium && chmod -R 755 /opt/chromium"`), { ignoreError: false });
        configureBrowser(sandboxName, sandboxExec, "/opt/chromium/chrome");
      } else {
        console.error("  WARNING: Could not find Chromium binary after install");
      }
    } else {
      const shellDir = path.dirname(headlessPath);
      runCapture(sandboxExec(`bash -c "cp -r ${shellDir} /opt/chromium-headless && chmod -R 755 /opt/chromium-headless"`), { ignoreError: false });
      configureBrowser(sandboxName, sandboxExec, "/opt/chromium-headless/chrome-headless-shell");
    }

    console.log("  ✓ Chromium browser installed and configured");
  } catch (err) {
    // Non-fatal — sandbox works fine without a browser
    console.error(`  WARNING: Browser install failed: ${err.message}`);
    console.error("  The sandbox will work without a browser. You can install manually later:");
    console.error(`    openshell sandbox connect ${sandboxName}  # then: npx playwright install chromium`);
    console.error(`    openshell sandbox connect ${sandboxName}  # then: npx playwright install-deps chromium`);
  }
}

/**
 * Configure OpenClaw to use the installed browser.
 * Sets browser.enabled, browser.executablePath, browser.noSandbox, browser.headless
 * in openclaw.json, updates the integrity hash, and fixes permissions.
 */
function configureBrowser(sandboxName, sandboxExec, browserPath) {
  // Update openclaw.json with browser config
  const configScript = `
import json
f = "/sandbox/.openclaw/openclaw.json"
d = json.load(open(f))
d["browser"] = {"enabled": True, "executablePath": "${browserPath}", "noSandbox": True, "headless": True}
json.dump(d, open(f, "w"), indent=2)
print("configured")
`.trim();
  runCapture(sandboxExec(`python3 -c '${configScript}' 2>&1`), { ignoreError: false });

  // Update integrity hash so the gateway accepts the modified config
  runCapture(sandboxExec(`bash -c "sha256sum /sandbox/.openclaw/openclaw.json > /sandbox/.openclaw/.config-hash"`), { ignoreError: true });

  // Fix permissions so the sandbox user (who runs the gateway) can write to .openclaw/
  runCapture(sandboxExec(`bash -c "chown -R sandbox:sandbox /sandbox/.openclaw/ && chmod -R 755 /sandbox/.openclaw/"`), { ignoreError: true });

  console.log(`  Browser path: ${browserPath}`);
}

// ── Step 5: NIM ──────────────────────────────────────────────────

async function setupNim(sandboxName, gpu) {
  step(3, 8, "Configuring AI inference");

  let model = null;
  let provider = "nvidia-nim";
  let nimContainer = null;

  // Detect local inference options
  const hasOllama = !!runCapture("command -v ollama", { ignoreError: true });
  const ollamaRunning = !!runCapture("curl -sf http://localhost:11434/api/tags 2>/dev/null", { ignoreError: true });
  const vllmRunning = !!runCapture("curl -sf http://localhost:8000/v1/models 2>/dev/null", { ignoreError: true });
  const requestedProvider = isNonInteractive() ? getNonInteractiveProvider() : null;
  const requestedModel = isNonInteractive() ? getNonInteractiveModel(requestedProvider || "cloud") : null;
  // Build options list — only show local options with DIFFRACTION_EXPERIMENTAL=1
  const options = [];
  if (EXPERIMENTAL && gpu && gpu.nimCapable) {
    options.push({ key: "nim", label: "Local NIM container (NVIDIA GPU) [experimental]" });
  }
  options.push({
    key: "cloud",
    label:
      "Diffract Cloud (NVIDIA-powered, build.nvidia.com)" +
      (!ollamaRunning && !(EXPERIMENTAL && vllmRunning) ? " (recommended)" : ""),
  });
  if (hasOllama || ollamaRunning) {
    options.push({
      key: "ollama",
      label:
        `Local Ollama (localhost:11434)${ollamaRunning ? " — running" : ""}` +
        (ollamaRunning ? " (suggested)" : ""),
    });
  }
  if (EXPERIMENTAL && vllmRunning) {
    options.push({
      key: "vllm",
      label: "Existing vLLM instance (localhost:8000) — running [experimental] (suggested)",
    });
  }

  // On macOS without Ollama, offer to install it
  if (!hasOllama && process.platform === "darwin") {
    options.push({ key: "install-ollama", label: "Install Ollama (macOS)" });
  }

  if (options.length > 1) {
    let selected;

    if (isNonInteractive()) {
      const providerKey = requestedProvider || "cloud";
      selected = options.find((o) => o.key === providerKey);
      if (!selected) {
        console.error(`  Requested provider '${providerKey}' is not available in this environment.`);
        process.exit(1);
      }
      console.log(`  [non-interactive] Provider: ${selected.key}`);
    } else {
      const suggestions = [];
      if (vllmRunning) suggestions.push("vLLM");
      if (ollamaRunning) suggestions.push("Ollama");
      if (suggestions.length > 0) {
        console.log(`  Detected local inference option${suggestions.length > 1 ? "s" : ""}: ${suggestions.join(", ")}`);
        console.log("  Select one explicitly to use it. Press Enter to keep the cloud default.");
        console.log("");
      }

      console.log("");
      console.log("  Inference options:");
      options.forEach((o, i) => {
        console.log(`    ${i + 1}) ${o.label}`);
      });
      console.log("");

      const defaultIdx = options.findIndex((o) => o.key === "cloud") + 1;
      const choice = await prompt(`  Choose [${defaultIdx}]: `);
      const idx = parseInt(choice || String(defaultIdx), 10) - 1;
      selected = options[idx] || options[defaultIdx - 1];
    }

    if (selected.key === "nim") {
      // List models that fit GPU VRAM
      const models = nim.listModels().filter((m) => m.minGpuMemoryMB <= gpu.totalMemoryMB);
      if (models.length === 0) {
        console.log("  No NIM models fit your GPU VRAM. Falling back to cloud API.");
      } else {
        let sel;
        if (isNonInteractive()) {
          if (requestedModel) {
            sel = models.find((m) => m.name === requestedModel);
            if (!sel) {
              console.error(`  Unsupported DIFFRACTION_MODEL for NIM: ${requestedModel}`);
              process.exit(1);
            }
          } else {
            sel = models[0];
          }
          console.log(`  [non-interactive] NIM model: ${sel.name}`);
        } else {
          console.log("");
          console.log("  Models that fit your GPU:");
          models.forEach((m, i) => {
            console.log(`    ${i + 1}) ${m.name} (min ${m.minGpuMemoryMB} MB)`);
          });
          console.log("");

          const modelChoice = await prompt(`  Choose model [1]: `);
          const midx = parseInt(modelChoice || "1", 10) - 1;
          sel = models[midx] || models[0];
        }
        model = sel.name;

        console.log(`  Pulling NIM image for ${model}...`);
        nim.pullNimImage(model);

        console.log("  Starting NIM container...");
        nimContainer = nim.startNimContainer(sandboxName, model);

        console.log("  Waiting for NIM to become healthy...");
        if (!nim.waitForNimHealth()) {
          console.error("  NIM failed to start. Falling back to cloud API.");
          model = null;
          nimContainer = null;
        } else {
          provider = "vllm-local";
        }
      }
    } else if (selected.key === "ollama") {
      if (!ollamaRunning) {
        console.log("  Starting Ollama...");
        run("OLLAMA_HOST=0.0.0.0:11434 ollama serve > /dev/null 2>&1 &", { ignoreError: true });
        sleep(2);
      }
      console.log("  ✓ Using Ollama on localhost:11434");
      provider = "ollama-local";
      if (isNonInteractive()) {
        model = requestedModel || getDefaultOllamaModel(runCapture);
      } else {
        model = await promptOllamaModel();
      }
    } else if (selected.key === "install-ollama") {
      console.log("  Installing Ollama via Homebrew...");
      run("brew install ollama", { ignoreError: true });
      console.log("  Starting Ollama...");
      run("OLLAMA_HOST=0.0.0.0:11434 ollama serve > /dev/null 2>&1 &", { ignoreError: true });
        sleep(2);
      console.log("  ✓ Using Ollama on localhost:11434");
      provider = "ollama-local";
      if (isNonInteractive()) {
        model = requestedModel || getDefaultOllamaModel(runCapture);
      } else {
        model = await promptOllamaModel();
      }
    } else if (selected.key === "vllm") {
      console.log("  ✓ Using existing vLLM on localhost:8000");
      provider = "vllm-local";
      model = "vllm-local";
    }
    // else: cloud — fall through to default below
  }

  if (provider === "nvidia-nim") {
    if (isNonInteractive()) {
      // In non-interactive mode, NVIDIA_API_KEY must be set via env var
      if (!process.env.NVIDIA_API_KEY) {
        console.error("  NVIDIA_API_KEY is required for cloud inference in non-interactive mode.");
        console.error("  Set it via: NVIDIA_API_KEY=nvapi-... diffract onboard --non-interactive");
        process.exit(1);
      }
    } else {
      await ensureApiKey();
      model = model || (await promptCloudModel()) || DEFAULT_CLOUD_MODEL;
    }
    model = model || requestedModel || DEFAULT_CLOUD_MODEL;
    console.log(`  Using Diffract Cloud inference with model: ${model}`);
  }

  registry.updateSandbox(sandboxName, { model, provider, nimContainer });

  return { model, provider };
}

// ── Step 5: Inference provider ───────────────────────────────────

async function setupInference(sandboxName, model, provider) {
  step(4, 8, "Setting up inference provider");

  if (provider === "nvidia-nim") {
    // Create nvidia-nim provider
    run(
      `openshell provider create --name nvidia-nim --type openai ` +
      `--credential "NVIDIA_API_KEY=${process.env.NVIDIA_API_KEY}" ` +
      `--config "OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1" 2>&1 || true`,
      { ignoreError: true }
    );
    run(
      `openshell inference set --no-verify --provider nvidia-nim --model ${model} 2>/dev/null || true`,
      { ignoreError: true }
    );
  } else if (provider === "vllm-local") {
    const validation = validateLocalProvider(provider, runCapture);
    if (!validation.ok) {
      console.error(`  ${validation.message}`);
      process.exit(1);
    }
    const baseUrl = getLocalProviderBaseUrl(provider);
    run(
      `openshell provider create --name vllm-local --type openai ` +
      `--credential "OPENAI_API_KEY=dummy" ` +
      `--config "OPENAI_BASE_URL=${baseUrl}" 2>&1 || ` +
      `openshell provider update vllm-local --credential "OPENAI_API_KEY=dummy" ` +
      `--config "OPENAI_BASE_URL=${baseUrl}" 2>&1 || true`,
      { ignoreError: true }
    );
    run(
      `openshell inference set --no-verify --provider vllm-local --model ${model} 2>/dev/null || true`,
      { ignoreError: true }
    );
  } else if (provider === "ollama-local") {
    const validation = validateLocalProvider(provider, runCapture);
    if (!validation.ok) {
      console.error(`  ${validation.message}`);
      console.error("  On macOS, local inference also depends on Diffract host routing support.");
      process.exit(1);
    }
    const baseUrl = getLocalProviderBaseUrl(provider);
    run(
      `openshell provider create --name ollama-local --type openai ` +
      `--credential "OPENAI_API_KEY=ollama" ` +
      `--config "OPENAI_BASE_URL=${baseUrl}" 2>&1 || ` +
      `openshell provider update ollama-local --credential "OPENAI_API_KEY=ollama" ` +
      `--config "OPENAI_BASE_URL=${baseUrl}" 2>&1 || true`,
      { ignoreError: true }
    );
    run(
      `openshell inference set --no-verify --provider ollama-local --model ${model} 2>/dev/null || true`,
      { ignoreError: true }
    );
    console.log(`  Priming Ollama model: ${model}`);
    run(getOllamaWarmupCommand(model), { ignoreError: true });
    const probe = validateOllamaModel(model, runCapture);
    if (!probe.ok) {
      console.error(`  ${probe.message}`);
      process.exit(1);
    }
  }

  registry.updateSandbox(sandboxName, { model, provider });
  console.log(`  ✓ Inference route set: ${provider} / ${model}`);
}

// ── Step 6: Diffract ─────────────────────────────────────────────

async function setupOpenclaw(sandboxName, model, provider) {
  step(7, 8, "Setting up Diffract + starting gateway");

  const selectionConfig = getProviderSelectionConfig(provider, model);
  if (selectionConfig) {
    const sandboxConfig = {
      ...selectionConfig,
      onboardedAt: new Date().toISOString(),
    };
    const script = buildSandboxConfigSyncScript(sandboxConfig);
    run(`cat <<'EOF_DIFFRACTION_SYNC' | openshell sandbox connect "${sandboxName}"
${script}
EOF_DIFFRACTION_SYNC`, { stdio: ["ignore", "ignore", "inherit"] });
  }

  console.log("  ✓ Diffract config synced to sandbox");

  // Start the OpenClaw gateway inside the sandbox
  // Use /usr/local/bin/diffract (the renamed openclaw binary) directly — npx would
  // try to download from npm which is blocked before policy presets are applied.
  console.log("  Starting OpenClaw gateway inside sandbox...");
  const startGwScript = `export HOME=/sandbox && nohup /usr/local/bin/diffract gateway run --bind loopback --port 18789 > /tmp/gw.log 2>&1 &`;
  run(`echo '${startGwScript}' | openshell sandbox connect "${sandboxName}"`, { stdio: ["ignore", "ignore", "inherit"] });

  // Wait for gateway to become healthy
  let healthy = false;
  for (let i = 0; i < 15; i++) {
    const check = runCapture("curl -sf http://127.0.0.1:18789/health 2>/dev/null", { ignoreError: true });
    if (check && check.includes("ok")) {
      healthy = true;
      break;
    }
    run("sleep 2", { stdio: "ignore" });
  }

  if (healthy) {
    console.log("  ✓ OpenClaw gateway running on :18789");
  } else {
    console.error("  WARNING: OpenClaw gateway did not become healthy within 30s");
    console.error("  You may need to start it manually: diffract " + sandboxName + " connect");
  }
}

// ── Step 7: Policy presets ───────────────────────────────────────

async function setupPolicies(sandboxName) {
  step(8, 8, "Policy presets");

  const suggestions = ["pypi", "npm"];

  // Auto-detect based on env tokens
  if (getCredential("TELEGRAM_BOT_TOKEN")) {
    suggestions.push("telegram");
    console.log("  Auto-detected: TELEGRAM_BOT_TOKEN → suggesting telegram preset");
  }
  if (getCredential("SLACK_BOT_TOKEN") || process.env.SLACK_BOT_TOKEN) {
    suggestions.push("slack");
    console.log("  Auto-detected: SLACK_BOT_TOKEN → suggesting slack preset");
  }
  if (getCredential("DISCORD_BOT_TOKEN") || process.env.DISCORD_BOT_TOKEN) {
    suggestions.push("discord");
    console.log("  Auto-detected: DISCORD_BOT_TOKEN → suggesting discord preset");
  }

  const allPresets = policies.listPresets();
  const applied = policies.getAppliedPresets(sandboxName);

  console.log("");
  console.log("  Available policy presets:");
  allPresets.forEach((p) => {
    const marker = applied.includes(p.name) ? "●" : "○";
    const suggested = suggestions.includes(p.name) ? " (suggested)" : "";
    console.log(`    ${marker} ${p.name} — ${p.description}${suggested}`);
  });
  console.log("");

  if (isNonInteractive()) {
    const policyMode = (process.env.DIFFRACTION_POLICY_MODE || "suggested").trim().toLowerCase();
    let selectedPresets = suggestions;

    if (policyMode === "skip" || policyMode === "none" || policyMode === "no") {
      console.log("  [non-interactive] Skipping policy presets.");
      return;
    }

    if (policyMode === "custom" || policyMode === "list") {
      selectedPresets = parsePolicyPresetEnv(process.env.DIFFRACTION_POLICY_PRESETS);
      if (selectedPresets.length === 0) {
        console.error("  DIFFRACTION_POLICY_PRESETS is required when DIFFRACTION_POLICY_MODE=custom.");
        process.exit(1);
      }
    } else if (policyMode === "suggested" || policyMode === "default" || policyMode === "auto") {
      const envPresets = parsePolicyPresetEnv(process.env.DIFFRACTION_POLICY_PRESETS);
      if (envPresets.length > 0) {
        selectedPresets = envPresets;
      }
    } else {
      console.error(`  Unsupported DIFFRACTION_POLICY_MODE: ${policyMode}`);
      console.error("  Valid values: suggested, custom, skip");
      process.exit(1);
    }

    const knownPresets = new Set(allPresets.map((p) => p.name));
    const invalidPresets = selectedPresets.filter((name) => !knownPresets.has(name));
    if (invalidPresets.length > 0) {
      console.error(`  Unknown policy preset(s): ${invalidPresets.join(", ")}`);
      process.exit(1);
    }

    if (!waitForSandboxReady(sandboxName)) {
      console.error(`  Sandbox '${sandboxName}' was not ready for policy application.`);
      process.exit(1);
    }
    console.log(`  [non-interactive] Applying policy presets: ${selectedPresets.join(", ")}`);
    for (const name of selectedPresets) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          policies.applyPreset(sandboxName, name);
          break;
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          if (!message.includes("sandbox not found") || attempt === 2) {
            throw err;
          }
          sleep(2);
        }
      }
    }
  } else {
    const answer = await prompt(`  Apply suggested presets (${suggestions.join(", ")})? [Y/n/list]: `);

    if (answer.toLowerCase() === "n") {
      console.log("  Skipping policy presets.");
      return;
    }

    if (answer.toLowerCase() === "list") {
      // Let user pick
      const picks = await prompt("  Enter preset names (comma-separated): ");
      const selected = picks.split(",").map((s) => s.trim()).filter(Boolean);
      for (const name of selected) {
        policies.applyPreset(sandboxName, name);
      }
    } else {
      // Apply suggested
      for (const name of suggestions) {
        policies.applyPreset(sandboxName, name);
      }
    }
  }

  console.log("  ✓ Policies applied");
}

// ── Dashboard ────────────────────────────────────────────────────

function printDashboard(sandboxName, model, provider) {
  const nimStat = nim.nimStatus(sandboxName);
  const nimLabel = nimStat.running ? "running" : "not running";

  let providerLabel = provider;
  if (provider === "nvidia-nim") providerLabel = "Diffract Cloud (NVIDIA)";
  else if (provider === "vllm-local") providerLabel = "Local vLLM";
  else if (provider === "ollama-local") providerLabel = "Local Ollama";

  console.log("");
  console.log(`  ${"─".repeat(50)}`);
  // console.log(`  Dashboard    http://localhost:18789/`);
  console.log(`  Sandbox      ${sandboxName} (Landlock + seccomp + netns)`);
  console.log(`  Model        ${model} (${providerLabel})`);
  console.log(`  Inference     ${nimStat.running ? "NIM container running" : providerLabel}`);
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  Run:         diffract ${sandboxName} connect`);
  console.log(`  Status:      diffract ${sandboxName} status`);
  console.log(`  Logs:        diffract ${sandboxName} logs --follow`);
  console.log(`  ${"─".repeat(50)}`);
  console.log("");
}

// ── Main ─────────────────────────────────────────────────────────

async function onboard(opts = {}) {
  NON_INTERACTIVE = opts.nonInteractive || process.env.DIFFRACTION_NON_INTERACTIVE === "1";

  // Acquire onboard lock (prevents concurrent onboard runs)
  const lock = session.acquireOnboardLock("diffract onboard");
  if (!lock.acquired) {
    console.error("");
    console.error(`  Another onboard process is already running (PID ${lock.holderPid || "unknown"}).`);
    console.error(`  If this is stale, remove: ${lock.lockFile}`);
    process.exit(1);
  }
  // Release lock on exit
  process.on("exit", () => session.releaseOnboardLock());
  process.on("SIGINT", () => { session.releaseOnboardLock(); process.exit(130); });
  process.on("SIGTERM", () => { session.releaseOnboardLock(); process.exit(143); });

  // Check for resumable session
  const existing = session.loadSession();
  if (existing && existing.resumable && existing.status !== "complete") {
    const lastStep = existing.lastCompletedStep;
    console.log("");
    console.log(`  Resuming previous onboard session (last completed: ${lastStep || "none"})`);
  }

  // Create or resume session
  const sess = existing && existing.resumable ? existing : session.createSession({
    mode: isNonInteractive() ? "non-interactive" : "interactive",
    metadata: { gatewayName: "diffract" },
  });
  session.saveSession(sess);

  console.log("");
  console.log("  Diffract — Enterprise AI Agent Setup");
  console.log("  Powered by Diffract (sandbox) + Diffract Agent (agent)");
  if (isNonInteractive()) console.log("  (non-interactive mode)");
  console.log("  " + "═".repeat(47));

  // Step tracking helper
  const shouldSkip = (stepName) => {
    const step = sess.steps[stepName];
    return step && step.status === "complete";
  };

  // Step order follows NemoClaw pattern:
  // 1. Preflight → 2. Gateway → 3. Provider selection → 4. Inference setup
  // → 5. Sandbox create → 6. Browser install → 7. OpenClaw + gateway start → 8. Policies
  // Provider/inference BEFORE sandbox so the sandbox gets the correct route at creation.

  let gpu;
  if (!shouldSkip("preflight")) {
    session.markStepStarted("preflight");
    try { gpu = await preflight(); session.markStepComplete("preflight"); }
    catch (e) { session.markStepFailed("preflight", e.message); throw e; }
  } else {
    console.log("  ✓ Preflight (skipped — already complete)");
    gpu = nim.detectGpu();
  }

  if (!shouldSkip("gateway")) {
    session.markStepStarted("gateway");
    try { await startGateway(gpu); session.markStepComplete("gateway"); }
    catch (e) { session.markStepFailed("gateway", e.message); throw e; }
  } else {
    console.log("  ✓ Gateway (skipped — already complete)");
  }

  // Steps 3+4: Provider selection and inference setup BEFORE sandbox creation
  let model, provider;
  if (!shouldSkip("provider_selection")) {
    session.markStepStarted("provider_selection");
    try {
      ({ model, provider } = await setupNim(null, gpu));
      session.markStepComplete("provider_selection", { model, provider });
    } catch (e) { session.markStepFailed("provider_selection", e.message); throw e; }
  } else {
    model = sess.model; provider = sess.provider;
    console.log(`  ✓ Provider selection (skipped — already complete)`);
  }

  if (!shouldSkip("inference")) {
    session.markStepStarted("inference");
    try {
      await setupInference(null, model, provider);
      session.markStepComplete("inference");
    } catch (e) { session.markStepFailed("inference", e.message); throw e; }
  } else {
    console.log("  ✓ Inference (skipped — already complete)");
  }

  // Step 5: Sandbox creation (now has correct inference route)
  let sandboxName;
  if (!shouldSkip("sandbox")) {
    session.markStepStarted("sandbox");
    try {
      sandboxName = await createSandbox(gpu);
      session.markStepComplete("sandbox", { sandboxName });
    } catch (e) { session.markStepFailed("sandbox", e.message); throw e; }
  } else {
    sandboxName = sess.sandboxName || "my-assistant";
    console.log(`  ✓ Sandbox '${sandboxName}' (skipped — already complete)`);
  }

  // Step 6: Browser install (non-fatal)
  if (!shouldSkip("browser")) {
    session.markStepStarted("browser");
    try {
      await installBrowser(sandboxName);
      session.markStepComplete("browser");
    } catch (e) { session.markStepFailed("browser", e.message); /* non-fatal */ }
  } else {
    console.log("  ✓ Browser (skipped — already complete)");
  }

  // Step 7: OpenClaw config + gateway start
  if (!shouldSkip("openclaw")) {
    session.markStepStarted("openclaw");
    try {
      await setupOpenclaw(sandboxName, model, provider);
      session.markStepComplete("openclaw");
    } catch (e) { session.markStepFailed("openclaw", e.message); throw e; }
  } else {
    console.log("  ✓ OpenClaw config (skipped — already complete)");
  }

  // Step 8: Policy presets
  if (!shouldSkip("policies")) {
    session.markStepStarted("policies");
    try {
      await setupPolicies(sandboxName);
      session.markStepComplete("policies");
    } catch (e) { session.markStepFailed("policies", e.message); throw e; }
  } else {
    console.log("  ✓ Policies (skipped — already complete)");
  }

  // Save baseline policy rules to registry so the dashboard knows which rules are system-level.
  // This runs after policies are applied, capturing all onboard-created rules.
  try {
    const policyOutput = runCapture(
      `openshell sandbox get "${sandboxName}" 2>/dev/null`,
      { ignoreError: true }
    );
    // Parse the sandbox spec to extract policy rule names (best-effort)
    if (policyOutput) {
      const ruleNames = [];
      const ruleMatch = policyOutput.match(/"network_policies"\s*:\s*\{([^}]*(?:\{[^}]*\})*[^}]*)\}/);
      if (ruleMatch) {
        const keyMatches = ruleMatch[0].matchAll(/"([a-z_]+)"\s*:\s*\{/g);
        for (const m of keyMatches) {
          if (m[1] !== "network_policies" && m[1] !== "endpoints" && m[1] !== "rules" && m[1] !== "binaries") {
            ruleNames.push(m[1]);
          }
        }
      }
      if (ruleNames.length > 0) {
        registry.updateSandbox(sandboxName, { baselinePolicies: ruleNames });
        console.log(`  Baseline policies saved: ${ruleNames.join(", ")}`);
      }
    }
  } catch { /* non-fatal */ }

  // Post-onboard: set up Caddy reverse proxy and start dashboard services
  try {
    console.log("");
    console.log("  Setting up web dashboard...");

    // Install Caddy if not present
    const hasCaddy = !!runCapture("which caddy 2>/dev/null", { ignoreError: true });
    if (!hasCaddy && process.platform === "linux") {
      console.log("  Installing Caddy...");
      run("apt-get install -y caddy 2>/dev/null || true", { stdio: ["ignore", "ignore", "inherit"] });
    }

    // Copy Caddyfile and start Caddy
    const caddyfileSrc = path.join(PROJECT_ROOT, "deploy", "caddy", "Caddyfile");
    if (fs.existsSync(caddyfileSrc) && fs.existsSync("/etc/caddy")) {
      fs.copyFileSync(caddyfileSrc, "/etc/caddy/Caddyfile");
      run("systemctl restart caddy 2>/dev/null && systemctl enable caddy 2>/dev/null || true", { ignoreError: true });
      console.log("  ✓ Caddy reverse proxy configured");
    }

    // Start API bridge
    const apiDir = path.join(PROJECT_ROOT, "api");
    if (fs.existsSync(path.join(apiDir, "server.js"))) {
      run(`mkdir -p /tmp/diffract-ui && cd "${apiDir}" && nohup node server.js > /tmp/diffract-ui/api.log 2>&1 &`, { ignoreError: true });
      console.log("  ✓ API bridge started on :3001");
    }

    // Start Next.js UI
    const uiDir = path.join(PROJECT_ROOT, "ui");
    if (fs.existsSync(path.join(uiDir, ".next"))) {
      run(`cd "${uiDir}" && nohup npm run start > /tmp/diffract-ui/ui.log 2>&1 &`, { ignoreError: true });
      console.log("  ✓ Dashboard UI started on :3000");
    }
  } catch { /* non-fatal — dashboard can be started manually */ }

  session.completeSession({ sandboxName, model, provider });
  printDashboard(sandboxName, model, provider);
}

module.exports = { buildSandboxConfigSyncScript, hasStaleGateway, isSandboxReady, onboard, setupNim };
