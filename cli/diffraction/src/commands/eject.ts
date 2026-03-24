// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginLogger, DiffractionConfig } from "../index.js";
import { execBlueprint } from "../blueprint/exec.js";
import { loadState, clearState } from "../blueprint/state.js";
import { restoreSnapshotToHost } from "./migration-state.js";

const HOME = process.env.HOME ?? "/tmp";

export interface EjectOptions {
  runId?: string;
  confirm: boolean;
  logger: PluginLogger;
  pluginConfig: DiffractionConfig;
}

export async function cliEject(opts: EjectOptions): Promise<void> {
  const { confirm, runId, logger } = opts;
  const state = loadState();

  if (!state.lastAction) {
    logger.error("No Diffraction deployment found. Nothing to eject from.");
    return;
  }

  if (!state.migrationSnapshot && !state.hostBackupPath) {
    logger.error("No migration snapshot found. Cannot restore host installation.");
    logger.info("If you used --skip-backup during migrate, manual restoration is required.");
    return;
  }

  const snapshotPath = state.migrationSnapshot ?? state.hostBackupPath;
  if (!snapshotPath) {
    logger.error("No snapshot or backup path found in state. Cannot restore.");
    return;
  }
  const snapshotDiffractionDir = join(snapshotPath, "diffraction");

  if (!existsSync(snapshotDiffractionDir)) {
    logger.error(`Snapshot directory not found: ${snapshotDiffractionDir}`);
    return;
  }

  if (!confirm) {
    logger.info("Eject will:");
    logger.info("  1. Stop the OpenShell sandbox");
    logger.info("  2. Rollback blueprint state");
    logger.info(`  3. Restore ~/.diffraction from snapshot: ${snapshotPath}`);
    logger.info("  4. Clear Diffraction state");
    logger.info("");
    logger.info("Run with --confirm to proceed, or cancel now.");
    return;
  }

  // Step 1: Rollback blueprint
  if (state.lastRunId && state.blueprintVersion) {
    const blueprintPath = join(HOME, ".diffraction", "blueprints", state.blueprintVersion);

    if (existsSync(blueprintPath)) {
      const rollbackResult = await execBlueprint(
        {
          blueprintPath,
          action: "rollback",
          profile: "default",
          runId: runId ?? state.lastRunId,
          jsonOutput: true,
        },
        logger,
      );

      if (!rollbackResult.success) {
        logger.warn(`Blueprint rollback returned errors: ${rollbackResult.output}`);
        logger.info("Continuing with host restoration...");
      }
    }
  }

  // Step 2: Restore host state using the original snapshot manifest paths.
  const restored = restoreSnapshotToHost(snapshotPath, logger);
  if (!restored) {
    logger.info(`Manual restore available at: ${snapshotDiffractionDir}`);
    return;
  }

  // Step 3: Clear Diffraction state
  clearState();

  logger.info("");
  logger.info("Eject complete. Host Diffraction installation has been restored.");
  logger.info("You can now run 'diffraction' directly on your host.");
}
