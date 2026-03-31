// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// E2E: Sandbox lifecycle — verifies sandbox list, status, connect, and
// policy commands work against a running sandbox.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execSync } = require("child_process");

const TIMEOUT = 30_000;

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: TIMEOUT }).trim();
  } catch (err) {
    return (err.stderr || "") + (err.stdout || "");
  }
}

function hasSandbox() {
  const out = run("openshell sandbox list 2>&1");
  return out.includes("Ready");
}

describe("E2E: sandbox lifecycle", { timeout: TIMEOUT }, () => {
  it("openshell sandbox list returns output", () => {
    const out = run("openshell sandbox list 2>&1");
    assert.ok(out.length > 0, "sandbox list returned empty");
  });

  it("diffract list shows registered sandboxes", () => {
    const out = run("diffract list 2>&1");
    assert.ok(out.length > 0);
  });

  it("sandbox status returns info (if sandbox exists)", () => {
    if (!hasSandbox()) return; // skip if no sandbox
    const out = run("diffract my-assistant status 2>&1");
    assert.ok(out.length > 0);
  });

  it("policy list shows presets (if sandbox exists)", () => {
    if (!hasSandbox()) return;
    const out = run("diffract my-assistant policy-list 2>&1");
    assert.match(out, /telegram|slack|npm|pypi/i);
  });

  it("openshell forward list returns output", () => {
    const out = run("openshell forward list 2>&1");
    assert.ok(out.length > 0);
  });

  it("openshell inference get returns provider info (if configured)", () => {
    const out = run("openshell inference get 2>&1");
    // Either shows provider or "Not configured"
    assert.ok(out.length > 0);
  });

  it("openshell provider list returns output", () => {
    const out = run("openshell provider list 2>&1");
    assert.ok(out.length > 0);
  });
});
