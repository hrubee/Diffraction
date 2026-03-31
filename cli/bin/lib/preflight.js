// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// Preflight checks for Diffract onboarding.

const net = require("net");
const { runCapture } = require("./runner");

/**
 * Check whether a TCP port is available for listening.
 *
 * Detection chain:
 *   1. lsof (primary) — identifies the blocking process name + PID
 *   2. Node.js net probe (fallback) — cross-platform, detects EADDRINUSE
 *
 * opts.lsofOutput — inject fake lsof output for testing (skips shell)
 * opts.skipLsof   — force the net-probe fallback path
 *
 * Returns:
 *   { ok: true }
 *   { ok: false, process: string, pid: number|null, reason: string }
 */
async function checkPortAvailable(port, opts) {
  const p = port || 18789;
  const o = opts || {};

  // ── lsof path ──────────────────────────────────────────────────
  if (!o.skipLsof) {
    let lsofOut;
    if (typeof o.lsofOutput === "string") {
      lsofOut = o.lsofOutput;
    } else {
      const hasLsof = runCapture("command -v lsof", { ignoreError: true });
      if (hasLsof) {
        lsofOut = runCapture(
          `lsof -i :${p} -sTCP:LISTEN -P -n 2>/dev/null`,
          { ignoreError: true }
        );
      }
    }

    if (typeof lsofOut === "string") {
      const lines = lsofOut.split("\n").filter((l) => l.trim());
      // Skip the header line (starts with COMMAND)
      const dataLines = lines.filter((l) => !l.startsWith("COMMAND"));
      if (dataLines.length > 0) {
        // Parse first data line: COMMAND PID USER ...
        const parts = dataLines[0].split(/\s+/);
        const proc = parts[0] || "unknown";
        const pid = parseInt(parts[1], 10) || null;
        return {
          ok: false,
          process: proc,
          pid,
          reason: `lsof reports ${proc} (PID ${pid}) listening on port ${p}`,
        };
      }
      // Empty lsof output is not authoritative — non-root users cannot
      // see listeners owned by root (e.g., docker-proxy, leftover gateway).
      // Fall through to the net probe which uses bind() at the kernel level.
    }
  }

  // ── net probe fallback ─────────────────────────────────────────
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve({
          ok: false,
          process: "unknown",
          pid: null,
          reason: `port ${p} is in use (EADDRINUSE)`,
        });
      } else {
        // Unexpected error — treat port as unavailable
        resolve({
          ok: false,
          process: "unknown",
          pid: null,
          reason: `port probe failed: ${err.message}`,
        });
      }
    });
    srv.listen(p, "127.0.0.1", () => {
      srv.close(() => resolve({ ok: true }));
    });
  });
}

/**
 * Check available disk space on a given path.
 * Returns { ok, availableGB, requiredGB, reason? }
 */
function checkDiskSpace(targetPath, requiredGB) {
  const req = requiredGB || 5;
  try {
    const out = runCapture(`df -BG "${targetPath || "/"}" 2>/dev/null | tail -1`);
    // Format: Filesystem 1G-blocks Used Available Use% Mounted
    const parts = out.trim().split(/\s+/);
    const availStr = parts[3]; // e.g. "12G"
    if (availStr) {
      const availableGB = parseInt(availStr.replace(/G$/i, ""), 10);
      if (!isNaN(availableGB)) {
        if (availableGB >= req) {
          return { ok: true, availableGB, requiredGB: req };
        }
        return {
          ok: false,
          availableGB,
          requiredGB: req,
          reason: `Only ${availableGB}GB free (need ${req}GB for container images)`,
        };
      }
    }
  } catch {}
  // Can't determine — don't block
  return { ok: true, availableGB: null, requiredGB: req };
}

/**
 * Check available system memory.
 * Returns { ok, availableMB, requiredMB, reason? }
 */
function checkMemory(requiredMB) {
  const req = requiredMB || 2048;
  try {
    // Linux: /proc/meminfo
    const fs = require("fs");
    if (fs.existsSync("/proc/meminfo")) {
      const meminfo = fs.readFileSync("/proc/meminfo", "utf-8");
      const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
      if (match) {
        const availableMB = Math.floor(parseInt(match[1], 10) / 1024);
        if (availableMB >= req) {
          return { ok: true, availableMB, requiredMB: req };
        }
        return {
          ok: false,
          availableMB,
          requiredMB: req,
          reason: `Only ${availableMB}MB free memory (need ${req}MB)`,
        };
      }
    }
    // macOS fallback
    const out = runCapture("sysctl -n hw.memsize 2>/dev/null");
    if (out) {
      const totalMB = Math.floor(parseInt(out.trim(), 10) / 1024 / 1024);
      // Can't easily get "available" on macOS; check total is reasonable
      if (totalMB >= req) {
        return { ok: true, availableMB: totalMB, requiredMB: req };
      }
      return { ok: false, availableMB: totalMB, requiredMB: req, reason: `System has ${totalMB}MB total memory (need ${req}MB)` };
    }
  } catch {}
  // Can't determine — don't block
  return { ok: true, availableMB: null, requiredMB: req };
}

module.exports = { checkPortAvailable, checkDiskSpace, checkMemory };
