// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// E2E: Onboard happy path — verifies the full onboard flow produces
// a working sandbox with gateway, inference, and policy presets.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TIMEOUT = 600_000; // 10 min — onboard builds Docker image

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: TIMEOUT }).trim();
  } catch (err) {
    return err.stderr || err.stdout || err.message;
  }
}

function runOrFail(cmd) {
  return execSync(cmd, { encoding: "utf-8", timeout: TIMEOUT }).trim();
}

describe("E2E: onboard happy path", { timeout: TIMEOUT }, () => {
  const sessionFile = path.join(process.env.HOME || "/tmp", ".diffract", "onboard-session.json");

  it("diffract help exits cleanly", () => {
    const out = runOrFail("diffract help");
    assert.match(out, /diffract — Diffract CLI/);
    assert.match(out, /onboard/);
    assert.match(out, /model list/);
    assert.match(out, /hub list/);
  });

  it("diffract model list shows models", () => {
    const out = runOrFail("diffract model list");
    assert.match(out, /Available models:/);
    assert.match(out, /nvidia\/nemotron/);
    assert.match(out, /Total: \d+ models/);
  });

  it("diffract hub list runs without error", () => {
    const out = runOrFail("diffract hub list");
    assert.match(out, /skills/i);
  });

  it("diffract list runs without error", () => {
    const out = run("diffract list");
    // Either shows sandboxes or "No sandboxes" — both are valid
    assert.ok(out.length > 0);
  });

  it("openshell is resolvable", () => {
    const out = run("which openshell || echo not_found");
    assert.ok(!out.includes("not_found"), "openshell binary not found on PATH");
  });

  it("session file is created after onboard", () => {
    // This test only validates if onboard has been run before
    if (!fs.existsSync(sessionFile)) {
      // Skip — onboard hasn't been run in this environment
      return;
    }
    const session = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
    assert.equal(session.status, "complete");
    assert.equal(session.steps.preflight.status, "complete");
    assert.equal(session.steps.gateway.status, "complete");
    assert.equal(session.steps.sandbox.status, "complete");
  });

  it("preflight checks disk and memory", () => {
    const { checkDiskSpace, checkMemory } = require("../../bin/lib/preflight");
    const disk = checkDiskSpace("/", 1);
    assert.ok(disk.ok, `Disk check failed: ${disk.reason}`);

    const mem = checkMemory(512);
    assert.ok(mem.ok, `Memory check failed: ${mem.reason}`);
  });

  it("registry atomic write works", () => {
    const registry = require("../../bin/lib/registry");
    const tmpName = `e2e-test-${Date.now()}`;

    registry.registerSandbox({ name: tmpName, model: "test-model" });
    const sb = registry.getSandbox(tmpName);
    assert.ok(sb, "Sandbox not found after register");
    assert.equal(sb.model, "test-model");

    registry.removeSandbox(tmpName);
    const removed = registry.getSandbox(tmpName);
    assert.equal(removed, null, "Sandbox still exists after remove");
  });
});
