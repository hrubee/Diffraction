#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const { execSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const { ROOT, PROJECT_ROOT, SCRIPTS, run, runCapture, runInteractive } = require("./lib/runner");
const {
  ensureApiKey,
  ensureGithubToken,
  getCredential,
  isRepoPrivate,
} = require("./lib/credentials");
const registry = require("./lib/registry");
const nim = require("./lib/nim");
const policies = require("./lib/policies");

// ── Global commands ──────────────────────────────────────────────

const GLOBAL_COMMANDS = new Set([
  "onboard", "list", "deploy", "setup", "setup-spark",
  "start", "stop", "status", "uninstall",
  "model", "hub", "doctor",
  "help", "--help", "-h",
]);

const REMOTE_UNINSTALL_URL = "https://raw.githubusercontent.com/NVIDIA/Diffract/refs/heads/main/uninstall.sh";

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveUninstallScript() {
  const candidates = [
    path.join(ROOT, "uninstall.sh"),
    path.join(__dirname, "..", "uninstall.sh"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function exitWithSpawnResult(result) {
  if (result.status !== null) {
    process.exit(result.status);
  }

  if (result.signal) {
    const signalNumber = os.constants.signals[result.signal];
    process.exit(signalNumber ? 128 + signalNumber : 1);
  }

  process.exit(1);
}

// ── Commands ─────────────────────────────────────────────────────

async function onboard(args) {
  const { onboard: runOnboard } = require("./lib/onboard");
  const allowedArgs = new Set(["--non-interactive"]);
  const unknownArgs = args.filter((arg) => !allowedArgs.has(arg));
  if (unknownArgs.length > 0) {
    console.error(`  Unknown onboard option(s): ${unknownArgs.join(", ")}`);
    console.error("  Usage: diffract onboard [--non-interactive]");
    process.exit(1);
  }
  const nonInteractive = args.includes("--non-interactive");
  await runOnboard({ nonInteractive });
}

async function setup() {
  console.log("");
  console.log("  ⚠  `diffract setup` is deprecated. Use `diffract onboard` instead.");
  console.log("     Running legacy setup.sh for backwards compatibility...");
  console.log("");
  await ensureApiKey();
  const { defaultSandbox } = registry.listSandboxes();
  const safeName = defaultSandbox && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(defaultSandbox) ? defaultSandbox : "";
  run(`bash "${SCRIPTS}/setup.sh" ${safeName}`);
}

async function setupSpark() {
  await ensureApiKey();
  run(`sudo -E NVIDIA_API_KEY="${process.env.NVIDIA_API_KEY}" bash "${SCRIPTS}/setup-spark.sh"`);
}

async function deploy(instanceName) {
  if (!instanceName) {
    console.error("  Usage: diffract deploy <instance-name>");
    console.error("");
    console.error("  Examples:");
    console.error("    diffract deploy my-gpu-box");
    console.error("    diffract deploy diffract-prod");
    console.error("    diffract deploy diffract-test");
    process.exit(1);
  }
  await ensureApiKey();
  if (isRepoPrivate("NVIDIA/Diffract")) {
    await ensureGithubToken();
  }
  const name = instanceName;
  const gpu = process.env.DIFFRACTION_GPU || "a2-highgpu-1g:nvidia-tesla-a100:1";

  console.log("");
  console.log(`  Deploying Diffract to Brev instance: ${name}`);
  console.log("");

  try {
    execSync("which brev", { stdio: "ignore" });
  } catch {
    console.error("brev CLI not found. Install: https://brev.nvidia.com");
    process.exit(1);
  }

  let exists = false;
  try {
    const out = execSync("brev ls 2>&1", { encoding: "utf-8" });
    exists = out.includes(name);
  } catch {}

  if (!exists) {
    console.log(`  Creating Brev instance '${name}' (${gpu})...`);
    run(`brev create ${name} --gpu "${gpu}"`);
  } else {
    console.log(`  Brev instance '${name}' already exists.`);
  }

  run(`brev refresh`, { ignoreError: true });

  console.log("  Waiting for SSH...");
  for (let i = 0; i < 60; i++) {
    try {
      execSync(`ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${name} 'echo ok' 2>/dev/null`, { encoding: "utf-8", stdio: "pipe" });
      break;
    } catch {
      if (i === 59) {
        console.error(`  Timed out waiting for SSH to ${name}`);
        process.exit(1);
      }
      spawnSync("sleep", ["3"]);
    }
  }

  console.log("  Syncing Diffract to VM...");
  run(`ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR ${name} 'mkdir -p /home/ubuntu/diffract'`);
  run(`rsync -az --delete --exclude node_modules --exclude .git --exclude src -e "ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR" "${PROJECT_ROOT}/scripts" "${ROOT}/Dockerfile" "${PROJECT_ROOT}/plugins/diffract-core" "${PROJECT_ROOT}/policies" "${PROJECT_ROOT}/blueprints" "${ROOT}/bin" "${ROOT}/package.json" ${name}:/home/ubuntu/diffract/`);

  const envLines = [`NVIDIA_API_KEY=${process.env.NVIDIA_API_KEY}`];
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) envLines.push(`GITHUB_TOKEN=${ghToken}`);
  const tgToken = getCredential("TELEGRAM_BOT_TOKEN");
  if (tgToken) envLines.push(`TELEGRAM_BOT_TOKEN=${tgToken}`);
  const envTmp = path.join(os.tmpdir(), `diffract-env-${Date.now()}`);
  fs.writeFileSync(envTmp, envLines.join("\n") + "\n", { mode: 0o600 });
  run(`scp -q -o StrictHostKeyChecking=no -o LogLevel=ERROR "${envTmp}" ${name}:/home/ubuntu/diffract/.env`);
  fs.unlinkSync(envTmp);

  console.log("  Running setup...");
  runInteractive(`ssh -t -o StrictHostKeyChecking=no -o LogLevel=ERROR ${name} 'cd /home/ubuntu/diffract && set -a && . .env && set +a && bash scripts/brev-setup.sh'`);

  if (tgToken) {
    console.log("  Starting services...");
    run(`ssh -o StrictHostKeyChecking=no -o LogLevel=ERROR ${name} 'cd /home/ubuntu/diffract && set -a && . .env && set +a && bash scripts/start-services.sh'`);
  }

  console.log("");
  console.log("  Connecting to sandbox...");
  console.log("");
  runInteractive(`ssh -t -o StrictHostKeyChecking=no -o LogLevel=ERROR ${name} 'cd /home/ubuntu/diffract && set -a && . .env && set +a && openshell sandbox connect diffract'`);
}

async function start() {
  await ensureApiKey();
  const { defaultSandbox } = registry.listSandboxes();
  const safeName = defaultSandbox && /^[a-zA-Z0-9._-]+$/.test(defaultSandbox) ? defaultSandbox : null;
  const sandboxEnv = safeName ? `SANDBOX_NAME="${safeName}"` : "";
  run(`${sandboxEnv} bash "${SCRIPTS}/start-services.sh"`);
}

function stop() {
  run(`bash "${SCRIPTS}/start-services.sh" --stop`);
}

function uninstall(args) {
  const localScript = resolveUninstallScript();
  if (localScript) {
    console.log(`  Running local uninstall script: ${localScript}`);
    const result = spawnSync("bash", [localScript, ...args], {
      stdio: "inherit",
      cwd: ROOT,
      env: process.env,
    });
    exitWithSpawnResult(result);
  }

  console.log(`  Local uninstall script not found; falling back to ${REMOTE_UNINSTALL_URL}`);
  const forwardedArgs = args.map(shellQuote).join(" ");
  const command = forwardedArgs.length > 0
    ? `curl -fsSL ${shellQuote(REMOTE_UNINSTALL_URL)} | bash -s -- ${forwardedArgs}`
    : `curl -fsSL ${shellQuote(REMOTE_UNINSTALL_URL)} | bash`;
  const result = spawnSync("bash", ["-c", command], {
    stdio: "inherit",
    cwd: ROOT,
    env: process.env,
  });
  exitWithSpawnResult(result);
}

function showStatus() {
  const recovery = require("./lib/runtime-recovery");

  // Show sandbox registry
  const { sandboxes, defaultSandbox } = registry.listSandboxes();
  if (sandboxes.length > 0) {
    console.log("");
    console.log("  Sandboxes:");
    for (const sb of sandboxes) {
      const def = sb.name === defaultSandbox ? " *" : "";
      const model = sb.model ? ` (${sb.model})` : "";
      console.log(`    ${sb.name}${def}${model}`);
    }
    console.log("");
  }

  // Check gateway + sandbox health
  const gwOut = runCapture("openshell status 2>&1", { ignoreError: true }) || "";
  const gwState = recovery.classifyGatewayStatus(gwOut);
  if (gwState.state !== "connected") {
    console.log(`  ⚠  Gateway: ${gwState.state} (${gwState.reason})`);
    const cmd = recovery.getRecoveryCommand();
    console.log(`     Recovery: ${cmd}`);
    console.log("");
  }

  // Show service status
  run(`bash "${SCRIPTS}/start-services.sh" --status`);
}

function listSandboxes() {
  const { sandboxes, defaultSandbox } = registry.listSandboxes();
  if (sandboxes.length === 0) {
    console.log("");
    console.log("  No sandboxes registered. Run `diffract onboard` to get started.");
    console.log("");
    return;
  }

  console.log("");
  console.log("  Sandboxes:");
  for (const sb of sandboxes) {
    const def = sb.name === defaultSandbox ? " *" : "";
    const model = sb.model || "unknown";
    const provider = sb.provider || "unknown";
    const gpu = sb.gpuEnabled ? "GPU" : "CPU";
    const presets = sb.policies && sb.policies.length > 0 ? sb.policies.join(", ") : "none";
    console.log(`    ${sb.name}${def}`);
    console.log(`      model: ${model}  provider: ${provider}  ${gpu}  policies: ${presets}`);
  }
  console.log("");
  console.log("  * = default sandbox");
  console.log("");
}

// ── Sandbox-scoped actions ───────────────────────────────────────

function sandboxConnect(sandboxName) {
  // Ensure port forward is alive before connecting
  run(`openshell forward start --background 18789 "${sandboxName}" 2>/dev/null || true`, { ignoreError: true });
  runInteractive(`openshell sandbox connect "${sandboxName}"`);
}

function sandboxStatus(sandboxName) {
  const sb = registry.getSandbox(sandboxName);
  if (sb) {
    console.log("");
    console.log(`  Sandbox: ${sb.name}`);
    console.log(`    Model:    ${sb.model || "unknown"}`);
    console.log(`    Provider: ${sb.provider || "unknown"}`);
    console.log(`    GPU:      ${sb.gpuEnabled ? "yes" : "no"}`);
    console.log(`    Policies: ${(sb.policies || []).join(", ") || "none"}`);
  }

  // diffract info
  run(`openshell sandbox get "${sandboxName}" 2>/dev/null || true`, { ignoreError: true });

  // NIM health
  const nimStat = nim.nimStatus(sandboxName);
  console.log(`    NIM:      ${nimStat.running ? `running (${nimStat.container})` : "not running"}`);
  if (nimStat.running) {
    console.log(`    Healthy:  ${nimStat.healthy ? "yes" : "no"}`);
  }
  console.log("");
}

function sandboxLogs(sandboxName, follow) {
  const followFlag = follow ? " --tail" : "";
  run(`openshell logs "${sandboxName}"${followFlag}`);
}

async function sandboxPolicyAdd(sandboxName) {
  const allPresets = policies.listPresets();
  const applied = policies.getAppliedPresets(sandboxName);

  console.log("");
  console.log("  Available presets:");
  allPresets.forEach((p) => {
    const marker = applied.includes(p.name) ? "●" : "○";
    console.log(`    ${marker} ${p.name} — ${p.description}`);
  });
  console.log("");

  const { prompt: askPrompt } = require("./lib/credentials");
  const answer = await askPrompt("  Preset to apply: ");
  if (!answer) return;

  const confirm = await askPrompt(`  Apply '${answer}' to sandbox '${sandboxName}'? [Y/n]: `);
  if (confirm.toLowerCase() === "n") return;

  policies.applyPreset(sandboxName, answer);
}

function sandboxPolicyList(sandboxName) {
  const allPresets = policies.listPresets();
  const applied = policies.getAppliedPresets(sandboxName);

  console.log("");
  console.log(`  Policy presets for sandbox '${sandboxName}':`);
  allPresets.forEach((p) => {
    const marker = applied.includes(p.name) ? "●" : "○";
    console.log(`    ${marker} ${p.name} — ${p.description}`);
  });
  console.log("");
}

function sandboxDestroy(sandboxName) {
  console.log(`  Stopping NIM for '${sandboxName}'...`);
  nim.stopNimContainer(sandboxName);

  console.log(`  Deleting sandbox '${sandboxName}'...`);
  run(`openshell sandbox delete "${sandboxName}" 2>/dev/null || true`, { ignoreError: true });

  registry.removeSandbox(sandboxName);
  console.log(`  ✓ Sandbox '${sandboxName}' destroyed`);
}

// ── Model management ────────────────────────────────────────────

function handleModel(args) {
  const modelRegistry = require("./lib/model-registry");
  const action = args[0] || "list";

  switch (action) {
    case "list": {
      const models = modelRegistry.getCloudModels();
      const reg = modelRegistry.loadRegistry();
      console.log("");
      console.log("  Available models:");
      for (const m of models) {
        const providerLabel = reg.providers[m.provider]?.label || m.provider;
        const reasoning = m.reasoning ? " [reasoning]" : "";
        console.log(`    ${m.id}  (${providerLabel})${reasoning}`);
      }
      console.log("");
      console.log(`  Default: ${reg.defaults.cloud || "none"}`);
      console.log(`  Total: ${models.length} models`);
      console.log("");
      break;
    }
    case "add": {
      const id = args[1];
      const provider = args[2] || "nvidia";
      const name = args[3] || id;
      if (!id) {
        console.error("  Usage: diffract model add <model-id> [provider] [name]");
        console.error("  Example: diffract model add meta/llama-4-scout nvidia \"Llama 4 Scout\"");
        process.exit(1);
      }
      modelRegistry.addModel({ id, provider, name });
      console.log(`  ✓ Added model: ${id} (provider: ${provider})`);
      break;
    }
    case "remove": {
      const id = args[1];
      if (!id) {
        console.error("  Usage: diffract model remove <model-id>");
        process.exit(1);
      }
      if (modelRegistry.removeModel(id)) {
        console.log(`  ✓ Removed model: ${id}`);
      } else {
        console.error(`  Model '${id}' not found in user registry (built-in models cannot be removed)`);
      }
      break;
    }
    default:
      console.error(`  Unknown model action: ${action}`);
      console.error("  Usage: diffract model [list|add|remove]");
      process.exit(1);
  }
}

// ── Hub (skills marketplace) ────────────────────────────────────

function handleHub(args) {
  const hub = require("./lib/hub");
  const action = args[0] || "list";

  switch (action) {
    case "list": {
      const skills = hub.listInstalled();
      if (skills.length === 0) {
        console.log("");
        console.log("  No skills installed. Install one with:");
        console.log("    diffract hub install <github-url-or-path>");
        console.log("");
        return;
      }
      console.log("");
      console.log("  Installed skills:");
      for (const s of skills) {
        const meta = s.hasSkillFile ? "" : " (no SKILL.md)";
        console.log(`    ${s.name}${meta}`);
      }
      console.log(`\n  Total: ${skills.length} skills`);
      console.log(`  Path: ${hub.SKILLS_DIR}`);
      console.log("");
      break;
    }
    case "install": {
      const source = args[1];
      if (!source) {
        console.error("  Usage: diffract hub install <github-url-or-local-path>");
        process.exit(1);
      }
      try {
        const result = hub.install(source);
        console.log(`  ✓ Installed skill: ${result.name} (from ${result.source})`);
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        process.exit(1);
      }
      break;
    }
    case "remove": {
      const name = args[1];
      if (!name) {
        console.error("  Usage: diffract hub remove <skill-name>");
        process.exit(1);
      }
      if (hub.remove(name)) {
        console.log(`  ✓ Removed skill: ${name}`);
      } else {
        console.error(`  Skill '${name}' not found`);
      }
      break;
    }
    case "info": {
      const name = args[1];
      if (!name) {
        console.error("  Usage: diffract hub info <skill-name>");
        process.exit(1);
      }
      const skill = hub.info(name);
      if (!skill) {
        console.error(`  Skill '${name}' not found`);
        process.exit(1);
      }
      console.log("");
      console.log(`  Skill: ${skill.name}`);
      console.log(`  Path:  ${skill.path}`);
      console.log(`  Files: ${skill.files.join(", ")}`);
      if (skill.description) {
        console.log(`\n  ${skill.description}`);
      }
      console.log("");
      break;
    }
    case "deploy": {
      const name = args[1];
      const sandbox = args[2] || registry.getDefault();
      if (!name) {
        console.error("  Usage: diffract hub deploy <skill-name> [sandbox-name]");
        process.exit(1);
      }
      if (!sandbox) {
        console.error("  No sandbox specified and no default sandbox found.");
        process.exit(1);
      }
      try {
        hub.deployToSandbox(name, sandbox);
        console.log(`  ✓ Deployed skill '${name}' to sandbox '${sandbox}'`);
        console.log("  Type /new in the dashboard to refresh skills.");
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`  Unknown hub action: ${action}`);
      console.error("  Usage: diffract hub [list|install|remove|info|deploy]");
      process.exit(1);
  }
}

// ── Doctor ───────────────────────────────────────────────────────

function runDoctor() {
  const recovery = require("./lib/runtime-recovery");
  const { checkDiskSpace, checkMemory } = require("./lib/preflight");
  let pass = 0, warn = 0, fail = 0;

  function check(label, fn) {
    try {
      const result = fn();
      if (result === true) { console.log(`  ✓ ${label}`); pass++; }
      else if (result === false) { console.log(`  ✗ ${label}`); fail++; }
      else { console.log(`  ⚠ ${label}: ${result}`); warn++; }
    } catch (e) {
      console.log(`  ✗ ${label}: ${e.message}`); fail++;
    }
  }

  console.log("");
  console.log("  Diffract Doctor — System Diagnostics");
  console.log("  " + "─".repeat(45));
  console.log("");

  // Docker
  check("Docker running", () => {
    runCapture("docker info 2>/dev/null | head -1");
    return true;
  });

  // Docker cgroup
  check("Docker cgroup mode", () => {
    const out = runCapture("cat /etc/docker/daemon.json 2>/dev/null || echo '{}'");
    return out.includes("host") ? true : "cgroup-ns-mode not set to host";
  });

  // OpenShell
  check("OpenShell installed", () => {
    const out = runCapture("openshell --version 2>&1");
    return out.includes("openshell") ? true : false;
  });

  // Node.js
  check("Node.js >= 20", () => {
    const major = parseInt(process.versions.node.split(".")[0], 10);
    return major >= 20 ? true : `Node ${process.versions.node} (need 20+)`;
  });

  // Disk
  check("Disk space (>= 5GB free)", () => {
    const d = checkDiskSpace("/", 5);
    return d.ok ? true : d.reason;
  });

  // Memory
  check("Memory (>= 2GB free)", () => {
    const m = checkMemory(2048);
    return m.ok ? true : m.reason;
  });

  // Gateway
  check("OpenShell gateway", () => {
    const out = runCapture("openshell status 2>&1");
    const state = recovery.classifyGatewayStatus(out);
    if (state.state === "connected") return true;
    return `${state.state} (${state.reason})`;
  });

  // Sandbox
  check("Sandbox running", () => {
    const out = runCapture("openshell sandbox list 2>&1");
    return out.includes("Ready") ? true : "no sandbox in Ready state";
  });

  // Port forward
  check("Port 18789 forwarded", () => {
    const out = runCapture("openshell forward list 2>&1");
    return out.includes("running") ? true : "port forward not active";
  });

  // Dashboard
  check("Dashboard reachable", () => {
    const out = runCapture("curl -sf --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:18789/ 2>&1");
    return out === "200" ? true : `HTTP ${out}`;
  });

  // Inference
  check("Inference provider configured", () => {
    const out = runCapture("openshell inference get 2>&1");
    return out.includes("Provider:") && !out.includes("Not configured") ? true : "not configured";
  });

  // Caddy
  check("Caddy running", () => {
    const out = runCapture("systemctl is-active caddy 2>/dev/null || echo inactive");
    return out.trim() === "active" ? true : "caddy is " + out.trim();
  });

  // Services
  const { sandboxes } = registry.listSandboxes();
  const defaultSb = sandboxes.length > 0 ? sandboxes[0].name : null;
  if (defaultSb) {
    const pidDir = `/tmp/diffract-services-${defaultSb}`;
    check("Gateway watchdog", () => {
      try {
        const pid = require("fs").readFileSync(`${pidDir}/gateway-watchdog.pid`, "utf-8").trim();
        process.kill(parseInt(pid), 0);
        return true;
      } catch { return "not running"; }
    });

    check("Telegram bridge", () => {
      try {
        const pid = require("fs").readFileSync(`${pidDir}/telegram-bridge.pid`, "utf-8").trim();
        process.kill(parseInt(pid), 0);
        return true;
      } catch { return "not running (set TELEGRAM_BOT_TOKEN and run diffract start)"; }
    });
  }

  // Session
  check("Onboard session", () => {
    const session = require("./lib/onboard-session");
    const s = session.loadSession();
    if (!s) return "no session (run diffract onboard)";
    return s.status === "complete" ? true : `status: ${s.status}`;
  });

  console.log("");
  console.log(`  Results: ${pass} passed, ${warn} warnings, ${fail} failed`);
  if (fail > 0) {
    console.log("");
    console.log("  Fix suggestions:");
    console.log("    diffract onboard          — re-run setup");
    console.log("    diffract start            — start services");
    console.log("    openshell forward start --background 18789 <sandbox>");
  }
  console.log("");
}

// ── Help ─────────────────────────────────────────────────────────

function help() {
  console.log(`
  diffract — Diffract CLI

  Getting Started:
    diffract onboard                 Interactive setup wizard (recommended)
    diffract setup                   Legacy setup (deprecated, use onboard)
    diffract setup-spark             Set up on DGX Spark (fixes cgroup v2 + Docker)

  Sandbox Management:
    diffract list                    List all sandboxes
    diffract <name> connect          Connect to a sandbox
    diffract <name> status           Show sandbox status and health
    diffract <name> logs [--follow]  View sandbox logs
    diffract <name> destroy          Stop NIM + delete sandbox

  Policy Presets:
    diffract <name> policy-add       Add a policy preset to a sandbox
    diffract <name> policy-list      List presets (● = applied)

  Models:
    diffract model list              List all available models
    diffract model add <id> [prov]   Add a custom model
    diffract model remove <id>       Remove a user-added model

  Skills Hub:
    diffract hub list                List installed skills
    diffract hub install <source>    Install from GitHub URL or local path
    diffract hub remove <name>       Remove an installed skill
    diffract hub info <name>         Show skill details
    diffract hub deploy <name>       Deploy skill into sandbox

  Deploy:
    diffract deploy <instance>       Deploy to a Brev VM and start services

  Services:
    diffract start                   Start services (Telegram, tunnel)
    diffract stop                    Stop all services
    diffract status                  Show sandbox list and service status
    diffract doctor                  Diagnose and troubleshoot issues
    diffract uninstall [flags]       Run uninstall.sh (local first, curl fallback)

  Uninstall flags:
    --yes                            Skip the confirmation prompt
    --keep-diffract                 Leave the diffract binary installed
    --delete-models                  Remove pulled Ollama models

  Credentials are prompted on first use, then saved securely
  in ~/.diffract/credentials.json (mode 600).
`);
}

// ── Dispatch ─────────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

(async () => {
  // No command → help
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  // Global commands
  if (GLOBAL_COMMANDS.has(cmd)) {
    switch (cmd) {
      case "onboard":     await onboard(args); break;
      case "setup":       await setup(); break;
      case "setup-spark": await setupSpark(); break;
      case "deploy":      await deploy(args[0]); break;
      case "start":       await start(); break;
      case "stop":        stop(); break;
      case "status":      showStatus(); break;
      case "uninstall":   uninstall(args); break;
      case "list":        listSandboxes(); break;
      case "model":       handleModel(args); break;
      case "hub":         handleHub(args); break;
      case "doctor":      runDoctor(); break;
      default:            help(); break;
    }
    return;
  }

  // Sandbox-scoped commands: diffract <name> <action>
  const sandbox = registry.getSandbox(cmd);
  if (sandbox) {
    const action = args[0] || "connect";
    const actionArgs = args.slice(1);

    switch (action) {
      case "connect":     sandboxConnect(cmd); break;
      case "status":      sandboxStatus(cmd); break;
      case "logs":        sandboxLogs(cmd, actionArgs.includes("--follow")); break;
      case "policy-add":  await sandboxPolicyAdd(cmd); break;
      case "policy-list": sandboxPolicyList(cmd); break;
      case "destroy":     sandboxDestroy(cmd); break;
      default:
        console.error(`  Unknown action: ${action}`);
        console.error(`  Valid actions: connect, status, logs, policy-add, policy-list, destroy`);
        process.exit(1);
    }
    return;
  }

  // Unknown command — suggest
  console.error(`  Unknown command: ${cmd}`);
  console.error("");

  // Check if it looks like a sandbox name with missing action
  const allNames = registry.listSandboxes().sandboxes.map((s) => s.name);
  if (allNames.length > 0) {
    console.error(`  Registered sandboxes: ${allNames.join(", ")}`);
    console.error(`  Try: diffract <sandbox-name> connect`);
    console.error("");
  }

  console.error(`  Run 'diffract help' for usage.`);
  process.exit(1);
})();
