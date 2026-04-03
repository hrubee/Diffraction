import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { grpcCall } from "../lib/grpc-client.js";

const router = Router();

// Get sandbox + its policy via GetSandbox (which reliably returns spec.policy)
async function getSandboxWithPolicy(name) {
  const data = await grpcCall("GetSandbox", { name });
  const sandbox = data.sandbox || data;
  if (!sandbox?.id) throw new Error(`Sandbox '${name}' not found`);
  return sandbox;
}

// GET /api/sandboxes/:name/active-policy — returns the live network policies
// Includes baseline_rules: dynamically determined from v1 policy history.
router.get("/:name/active-policy", async (req, res) => {
  try {
    const sandbox = await getSandboxWithPolicy(req.params.name);
    const policy = sandbox.spec?.policy || {};
    const networkPolicies = policy.network_policies || {};

    // Determine baseline rules dynamically.
    // Strategy: read the baseline manifest saved by onboard, or fall back to
    // policy history, or as last resort lock all current rules.
    let baselineRules = [];

    // 1. Try sandbox registry (written by onboard after policies are applied)
    try {
      const registryPath = path.join(
        process.env.HOME || "/root",
        ".diffract",
        "sandboxes.json"
      );
      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
        const entry = (registry.sandboxes || []).find(
          (s) => s.name === req.params.name
        );
        if (entry?.baselinePolicies?.length > 0) {
          baselineRules = entry.baselinePolicies;
        }
      }
    } catch { /* ignore */ }

    // 2. Try policy history — v1 rules are always baseline
    if (baselineRules.length === 0) {
      try {
        const history = await grpcCall("ListSandboxPolicies", {
          name: req.params.name,
        });
        const revisions = (history.revisions || []).sort(
          (a, b) => (a.version || 0) - (b.version || 0)
        );
        // Collect all rule names from all versions up to the onboard-created ones.
        // Onboard creates v1 (sandbox create) then applies presets (v2, v3, etc.).
        // The last onboard version is stored in the sandbox registry, but we don't
        // have access here. Instead: all rules that exist in the LOWEST version
        // that has a policy payload are baseline.
        for (const rev of revisions) {
          if (rev.policy && rev.policy.network_policies) {
            baselineRules = Object.keys(rev.policy.network_policies);
            break;
          }
        }
      } catch { /* ignore */ }
    }

    // 3. Fallback: if we still can't determine baseline, lock all current rules.
    // This is the safe default — prevents accidental revocation.
    // User-added rules will show up once a draft is approved (policy version > onboard version).
    if (baselineRules.length === 0) {
      baselineRules = Object.keys(networkPolicies);
    }

    res.json({
      version: policy.version || sandbox.current_policy_version || 0,
      policy_hash: "",
      network_policies: networkPolicies,
      baseline_rules: baselineRules,
    });
  } catch (err) {
    if (err.message.includes("UNAVAILABLE") || err.message.includes("NOT_FOUND")) {
      res.json({ version: 0, policy_hash: "", network_policies: {}, baseline_rules: [] });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// DELETE /api/sandboxes/:name/active-policy/:ruleName — revoke a network policy rule
router.delete("/:name/active-policy/:ruleName", async (req, res) => {
  try {
    const sandbox = await getSandboxWithPolicy(req.params.name);
    const policy = sandbox.spec?.policy || {};
    const networkPolicies = policy.network_policies || {};

    // Check rule exists
    if (!(req.params.ruleName in networkPolicies)) {
      res.status(404).json({
        error: `Network policy rule '${req.params.ruleName}' not found`,
      });
      return;
    }

    // Remove the rule
    delete networkPolicies[req.params.ruleName];

    // Push updated policy via UpdateConfig
    const updated = await grpcCall("UpdateConfig", {
      name: req.params.name,
      policy: { ...policy, network_policies: networkPolicies },
    });

    res.json({
      version: updated.version || 0,
      policy_hash: updated.policy_hash || "",
      revoked: req.params.ruleName,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
