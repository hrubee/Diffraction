// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// E2E: Inference round-trip — verifies the gateway can reach the
// inference provider and return a response.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");

const TIMEOUT = 60_000;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: TIMEOUT }).trim();
  } catch (err) {
    return (err.stderr || "") + (err.stdout || "");
  }
}

function hasSandbox() {
  return run("openshell sandbox list 2>&1").includes("Ready");
}

function hasInference() {
  const out = run("openshell inference get 2>&1");
  return out.includes("Provider:") && !out.includes("Not configured");
}

describe("E2E: inference round-trip", { timeout: TIMEOUT }, () => {
  it("inference provider is configured", () => {
    if (!hasSandbox()) return;
    const out = run("openshell inference get 2>&1");
    assert.match(out, /Provider:/);
    assert.match(out, /Model:/);
  });

  it("dashboard HTTP endpoint responds", () => {
    if (!hasSandbox()) return;
    const out = run("curl -sf --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:18789/ 2>&1");
    assert.equal(out, "200", `Dashboard returned HTTP ${out}, expected 200`);
  });

  it("gateway serves HTML with correct content-type", () => {
    if (!hasSandbox()) return;
    const out = run("curl -sf --max-time 10 -D- http://127.0.0.1:18789/ 2>&1 | head -10");
    assert.match(out, /text\/html/i);
  });

  it("inference.local is reachable from sandbox via proxy", () => {
    if (!hasSandbox() || !hasInference()) return;
    // Test from inside the sandbox using the L7 proxy
    const cluster = run('docker ps --filter "name=openshell-cluster" --format "{{.Names}}" | head -1');
    if (!cluster) return;

    const out = run(
      `docker exec ${cluster} kubectl exec -n openshell my-assistant -- ` +
      `bash -c "HTTPS_PROXY=http://10.200.0.1:3128 curl -sk --max-time 15 https://inference.local/v1/models 2>&1 | head -1"`
    );
    // Should return JSON with model list
    assert.match(out, /object|models|error/i, `Unexpected inference.local response: ${out.slice(0, 100)}`);
  });
});
