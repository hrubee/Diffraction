// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const UNINSTALL_SCRIPT = path.join(__dirname, "..", "uninstall.sh");

describe("uninstall helpers", () => {
  it("returns the expected gateway volume candidate", () => {
    const result = spawnSync(
      "bash",
      ["-lc", `source "${UNINSTALL_SCRIPT}"; gateway_volume_candidates diffraction`],
      {
        cwd: path.join(__dirname, ".."),
        encoding: "utf-8",
      },
    );

    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "openshell-cluster-diffraction");
  });

  it("removes the user-local diffraction shim", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "diffraction-uninstall-shim-"));
    const shimDir = path.join(tmp, ".local", "bin");
    const shimPath = path.join(shimDir, "diffraction");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(shimPath, "#!/usr/bin/env bash\n", { mode: 0o755 });

    const result = spawnSync(
      "bash",
      ["-lc", `HOME="${tmp}" source "${UNINSTALL_SCRIPT}"; remove_diffraction_cli`],
      {
        cwd: path.join(__dirname, ".."),
        encoding: "utf-8",
      },
    );

    assert.equal(result.status, 0);
    assert.equal(fs.existsSync(shimPath), false);
  });
});
