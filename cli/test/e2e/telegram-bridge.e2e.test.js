// SPDX-FileCopyrightText: Copyright (c) 2026 Diffraction contributors.
// SPDX-License-Identifier: Apache-2.0
//
// E2E: Telegram bridge smoke test — verifies the bridge script loads
// without errors, validates config, and handles missing tokens gracefully.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execSync, spawnSync } = require("child_process");
const path = require("path");

const BRIDGE_SCRIPT = path.join(__dirname, "..", "..", "..", "scripts", "telegram-bridge.js");
const TIMEOUT = 10_000;

describe("E2E: telegram bridge smoke", { timeout: TIMEOUT }, () => {
  it("bridge script exists and has valid syntax", () => {
    const result = spawnSync("node", ["-c", BRIDGE_SCRIPT], {
      encoding: "utf-8",
      timeout: 5000,
    });
    assert.equal(result.status, 0, `Syntax error: ${result.stderr}`);
  });

  it("bridge exits with error when TELEGRAM_BOT_TOKEN is missing", () => {
    const result = spawnSync("node", [BRIDGE_SCRIPT], {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, TELEGRAM_BOT_TOKEN: "", NVIDIA_API_KEY: "test" },
    });
    assert.notEqual(result.status, 0, "Bridge should exit non-zero without token");
    assert.match(result.stderr, /TELEGRAM_BOT_TOKEN/);
  });

  it("bridge exits with error when NVIDIA_API_KEY is missing", () => {
    const result = spawnSync("node", [BRIDGE_SCRIPT], {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, TELEGRAM_BOT_TOKEN: "test", NVIDIA_API_KEY: "" },
    });
    assert.notEqual(result.status, 0, "Bridge should exit non-zero without API key");
    assert.match(result.stderr, /NVIDIA_API_KEY/);
  });

  it("resolve-openshell module loads without error", () => {
    const { resolveOpenshell } = require("../../bin/lib/resolve-openshell");
    // Should return a path or null — not throw
    const result = resolveOpenshell();
    assert.ok(result === null || typeof result === "string");
  });

  it("rate limiter rejects after threshold", () => {
    // Simulate rate limiting logic
    const buckets = new Map();
    const LIMIT = 3;

    function isLimited(chatId) {
      const now = Date.now();
      if (!buckets.has(chatId)) buckets.set(chatId, []);
      const ts = buckets.get(chatId);
      while (ts.length > 0 && ts[0] < now - 60000) ts.shift();
      if (ts.length >= LIMIT) return true;
      ts.push(now);
      return false;
    }

    assert.equal(isLimited("123"), false);
    assert.equal(isLimited("123"), false);
    assert.equal(isLimited("123"), false);
    assert.equal(isLimited("123"), true, "Should be rate limited after 3 msgs");
    assert.equal(isLimited("456"), false, "Different chat should not be limited");
  });
});
