// Skills / Policy Presets API
// Reads preset YAML files from policies/presets/ and exposes them as "skills"
// that can be applied to sandboxes by merging their network_policies.

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grpcCall } from "../lib/grpc-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PRESETS_DIR = path.join(PROJECT_ROOT, "policies", "presets");

const router = Router();

/**
 * Parse a preset YAML file using regex (no external dependency).
 * Extracts: preset.name, preset.description, and all network_policies entries.
 */
function parsePresetYaml(yamlText, filename) {
  // Strip YAML comments
  const stripped = yamlText.replace(/#[^\n]*/g, "");

  // Extract preset.name
  const nameMatch = stripped.match(/preset:\s*\n\s+name:\s*["']?([^\n"']+)["']?/);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(filename, ".yaml");

  // Extract preset.description
  const descMatch = stripped.match(/preset:\s*\n(?:\s+\w+:[^\n]*\n)*\s+description:\s*["']?([^\n"']+)["']?/);
  const description = descMatch ? descMatch[1].trim() : "";

  // Extract all endpoint hosts from network_policies section
  // Each endpoint line looks like: `      - host: api.telegram.org`
  const networkSection = stripped.split(/^network_policies:/m)[1] || "";
  const hostMatches = [...networkSection.matchAll(/\s+host:\s*["']?([^\n"']+)["']?/g)];
  const endpoints = hostMatches.map((m) => m[1].trim());

  // Extract all network_policies rule keys (top-level keys under network_policies:)
  const policyKeyMatches = [...networkSection.matchAll(/^  (\w+):/gm)];
  const policyKeys = policyKeyMatches.map((m) => m[1].trim());

  // Determine category from filename/name
  const categoryMap = {
    telegram: "messaging",
    discord: "messaging",
    slack: "messaging",
    outlook: "messaging",
    linkedin: "social",
    npm: "development",
    pypi: "development",
    docker: "development",
    huggingface: "ai",
    jira: "productivity",
    zapier: "productivity",
  };
  const category = categoryMap[name] || "other";

  return { name, description, endpoints, policyKeys, category };
}

/**
 * Parse the full network_policies block from a preset YAML as a plain object.
 * Returns a Record<string, object> keyed by policy rule name.
 * We do a best-effort structured parse; the result is used to merge into
 * an existing sandbox policy via gRPC UpdateConfig.
 */
function extractNetworkPolicies(yamlText) {
  // Split at `network_policies:` to isolate the block
  const parts = yamlText.split(/^network_policies:\s*$/m);
  if (parts.length < 2) return {};

  const block = parts[1];

  // Each top-level key under network_policies is a rule name at 2-space indent
  // We collect each rule block as raw YAML text for now, and build a minimal
  // structured object that the gRPC UpdateConfig can consume.
  //
  // Structure we need to reproduce (from sandbox.proto / policy engine):
  // {
  //   rule_name: {
  //     name: string,
  //     endpoints: [{ host, port, protocol, enforcement, tls, rules: [...] }]
  //   }
  // }

  const policies = {};
  const ruleHeaderRe = /^  (\w+):\s*$/gm;
  let match;
  const ruleStarts = [];

  while ((match = ruleHeaderRe.exec(block)) !== null) {
    ruleStarts.push({ key: match[1], index: match.index });
  }

  for (let i = 0; i < ruleStarts.length; i++) {
    const { key, index } = ruleStarts[i];
    const end = i + 1 < ruleStarts.length ? ruleStarts[i + 1].index : block.length;
    const ruleBlock = block.slice(index, end);

    // Extract name field
    const nameMatch = ruleBlock.match(/^\s+name:\s*["']?([^\n"']+)["']?/m);
    const ruleName = nameMatch ? nameMatch[1].trim() : key;

    // Extract endpoints
    const endpointBlocks = ruleBlock.split(/\s+-\s+host:/);
    const endpoints = [];

    for (let j = 1; j < endpointBlocks.length; j++) {
      const epBlock = endpointBlocks[j];

      const hostMatch = epBlock.match(/^["']?([^\n"']+)["']?/);
      const portMatch = epBlock.match(/port:\s*(\d+)/);
      const protocolMatch = epBlock.match(/protocol:\s*["']?([^\n"']+)["']?/);
      const enforcementMatch = epBlock.match(/enforcement:\s*["']?([^\n"']+)["']?/);
      const tlsMatch = epBlock.match(/tls:\s*["']?([^\n"']+)["']?/);

      // Extract rules
      const ruleMatches = [...epBlock.matchAll(/allow:\s*\{\s*method:\s*(\w+),\s*path:\s*["']?([^\n"'}\s]+)["']?\s*\}/g)];
      const rules = ruleMatches.map((rm) => ({
        allow: { method: rm[1], path: rm[2] },
      }));

      endpoints.push({
        host: hostMatch ? hostMatch[1].trim() : "",
        port: portMatch ? parseInt(portMatch[1], 10) : 443,
        protocol: protocolMatch ? protocolMatch[1].trim() : "rest",
        enforcement: enforcementMatch ? enforcementMatch[1].trim() : "enforce",
        tls: tlsMatch ? tlsMatch[1].trim() : "terminate",
        rules,
      });
    }

    policies[key] = { name: ruleName, endpoints };
  }

  return policies;
}

/** Load all presets from the presets directory. */
function loadPresets() {
  if (!fs.existsSync(PRESETS_DIR)) return [];

  const files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".yaml"));
  const presets = [];

  for (const file of files) {
    try {
      const text = fs.readFileSync(path.join(PRESETS_DIR, file), "utf-8");
      presets.push(parsePresetYaml(text, file));
    } catch {
      // Skip malformed files
    }
  }

  return presets.sort((a, b) => a.name.localeCompare(b.name));
}

// GET /api/skills — list all available policy presets
router.get("/", (_req, res) => {
  try {
    const presets = loadPresets();
    res.json({ presets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/skills/:name/apply/:sandbox — merge preset network_policies into sandbox
router.post("/:name/apply/:sandbox", async (req, res) => {
  const { name: presetName, sandbox: sandboxName } = req.params;

  try {
    // 1. Find the preset file
    if (!fs.existsSync(PRESETS_DIR)) {
      res.status(404).json({ error: "Presets directory not found" });
      return;
    }

    const files = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".yaml"));
    let presetText = null;

    for (const file of files) {
      const text = fs.readFileSync(path.join(PRESETS_DIR, file), "utf-8");
      const parsed = parsePresetYaml(text, file);
      if (parsed.name === presetName) {
        presetText = text;
        break;
      }
    }

    if (!presetText) {
      res.status(404).json({ error: `Preset '${presetName}' not found` });
      return;
    }

    // 2. Fetch current sandbox policy
    const data = await grpcCall("GetSandbox", { name: sandboxName });
    const sandbox = data.sandbox || data;
    if (!sandbox?.id) {
      res.status(404).json({ error: `Sandbox '${sandboxName}' not found` });
      return;
    }

    const existingPolicy = sandbox.spec?.policy || {};
    const existingNetworkPolicies = existingPolicy.network_policies || {};

    // 3. Extract preset network_policies
    const presetPolicies = extractNetworkPolicies(presetText);

    // 4. Merge — preset rules are added; existing rules are not overwritten
    const mergedNetworkPolicies = {
      ...presetPolicies,       // preset rules first (lower priority)
      ...existingNetworkPolicies, // existing rules win if same key
    };

    // 5. Push merged policy via UpdateConfig
    const updated = await grpcCall("UpdateConfig", {
      name: sandboxName,
      policy: {
        ...existingPolicy,
        network_policies: mergedNetworkPolicies,
      },
    });

    res.json({
      applied: presetName,
      sandbox: sandboxName,
      version: updated.version || 0,
      rules_added: Object.keys(presetPolicies),
    });
  } catch (err) {
    if (err.message.includes("UNAVAILABLE") || err.message.includes("NOT_FOUND")) {
      res.status(503).json({ error: "Gateway unavailable — sandbox may be offline" });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export default router;
