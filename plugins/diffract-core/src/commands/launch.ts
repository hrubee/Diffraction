// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execSync } from "node:child_process";
import type { PluginLogger, DiffractConfig } from "../index.js";
import { resolveBlueprint } from "../blueprint/resolve.js";
import { verifyBlueprintDigest, checkCompatibility } from "../blueprint/verify.js";
import { execBlueprint } from "../blueprint/exec.js";
import { loadState, saveState } from "../blueprint/state.js";
import { detectHostDiffract } from "./migrate.js";

export interface LaunchOptions {
  force: boolean;
  profile: string;
  logger: PluginLogger;
  pluginConfig: DiffractConfig;
}

export async function cliLaunch(opts: LaunchOptions): Promise<void> {
  const { force, profile, logger, pluginConfig } = opts;

  logger.info("Diffract launch: setting up Diffract inside Diffract");

  // Check if there's an existing host Diffract installation
  const hostState = detectHostDiffract();

  if (!hostState.exists && !force) {
    logger.info("");
    logger.info("No existing Diffract installation detected on this host.");
    logger.info("");
    logger.info("For net-new users, the recommended path is Diffract-native setup:");
    logger.info("");
    logger.info("  diffract sandbox create --from diffract --name diffract");
    logger.info("  diffract sandbox connect diffract");
    logger.info("");
    logger.info(
      "This avoids installing Diffract on the host only to redeploy it inside Diffract.",
    );
    logger.info("");
    logger.info("To proceed with Diffract-driven bootstrap anyway, use --force.");
    return;
  }

  if (hostState.exists && !force) {
    logger.info(
      "Existing Diffract installation detected. Consider using 'diffract diffract migrate' instead.",
    );
    logger.info(
      "Use --force to proceed with a fresh launch (existing config will not be migrated).",
    );
    return;
  }

  // Resolve and verify blueprint
  logger.info("Resolving blueprint...");
  const blueprint = await resolveBlueprint(pluginConfig);

  logger.info("Verifying blueprint integrity...");
  const verification = verifyBlueprintDigest(blueprint.localPath, blueprint.manifest);
  if (!verification.valid) {
    logger.error(`Blueprint verification failed: ${verification.errors.join(", ")}`);
    return;
  }

  // Check version compatibility
  const diffractVersion = getOpenshellVersion();
  const diffractVersion = getOpenclawVersion();
  const compat = checkCompatibility(blueprint.manifest, diffractVersion, diffractVersion);
  if (compat.length > 0) {
    logger.error(`Compatibility check failed:\n  ${compat.join("\n  ")}`);
    return;
  }

  // Plan
  logger.info("Planning deployment...");
  const planResult = await execBlueprint(
    {
      blueprintPath: blueprint.localPath,
      action: "plan",
      profile,
      jsonOutput: true,
    },
    logger,
  );

  if (!planResult.success) {
    logger.error(`Blueprint plan failed: ${planResult.output}`);
    return;
  }

  // Apply
  logger.info("Deploying Diffract sandbox...");
  const applyResult = await execBlueprint(
    {
      blueprintPath: blueprint.localPath,
      action: "apply",
      profile,
      planPath: planResult.runId,
      jsonOutput: true,
    },
    logger,
  );

  if (!applyResult.success) {
    logger.error(`Blueprint apply failed: ${applyResult.output}`);
    return;
  }

  // Save state
  saveState({
    ...loadState(),
    lastRunId: applyResult.runId,
    lastAction: "launch",
    blueprintVersion: blueprint.version,
    sandboxName: pluginConfig.sandboxName,
  });

  logger.info("");
  logger.info("Diffract is now running inside Diffract.");
  logger.info(`Sandbox: ${pluginConfig.sandboxName}`);
  logger.info("");
  logger.info("Next steps:");
  logger.info("  diffract diffract connect    # Enter the sandbox");
  logger.info("  diffract diffract status     # Check health");
  logger.info("  diffract term               # Monitor network egress");
}

function getOpenshellVersion(): string {
  try {
    return execSync("diffract --version", { encoding: "utf-8" }).trim();
  } catch {
    return "0.0.0";
  }
}

function getOpenclawVersion(): string {
  try {
    return execSync("diffract --version", { encoding: "utf-8" }).trim();
  } catch {
    return "0.0.0";
  }
}
