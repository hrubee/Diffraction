// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CLI registrar for `diffraction diffraction <subcommand>`.
 *
 * Wires commander.js subcommands to the existing blueprint infrastructure.
 */

import type { DiffractionPluginApi, PluginCliContext } from "./index.js";
import { getPluginConfig } from "./index.js";
import { cliStatus } from "./commands/status.js";
import { cliMigrate } from "./commands/migrate.js";
import { cliLaunch } from "./commands/launch.js";
import { cliConnect } from "./commands/connect.js";
import { cliEject } from "./commands/eject.js";
import { cliLogs } from "./commands/logs.js";
import { cliOnboard } from "./commands/onboard.js";

export function registerCliCommands(ctx: PluginCliContext, api: DiffractionPluginApi): void {
  const { program, logger } = ctx;
  const pluginConfig = getPluginConfig(api);

  const diffraction = program.command("diffraction").description("Diffraction sandbox management");

  // diffraction diffraction status
  diffraction
    .command("status")
    .description("Show sandbox, blueprint, and inference state")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json: boolean }) => {
      await cliStatus({ json: opts.json, logger, pluginConfig });
    });

  // diffraction diffraction migrate
  diffraction
    .command("migrate")
    .description("Migrate host Diffraction installation into an OpenShell sandbox")
    .option("--dry-run", "Show what would be migrated without making changes", false)
    .option("--profile <profile>", "Blueprint profile to use", "default")
    .option("--skip-backup", "Skip creating a host backup snapshot", false)
    .action(async (opts: { dryRun: boolean; profile: string; skipBackup: boolean }) => {
      await cliMigrate({
        dryRun: opts.dryRun,
        profile: opts.profile,
        skipBackup: opts.skipBackup,
        logger,
        pluginConfig,
      });
    });

  // diffraction diffraction launch
  diffraction
    .command("launch")
    .description("Fresh setup: bootstrap Diffraction inside OpenShell")
    .option("--force", "Skip ergonomics warning and force plugin-driven bootstrap", false)
    .option("--profile <profile>", "Blueprint profile to use", "default")
    .action(async (opts: { force: boolean; profile: string }) => {
      await cliLaunch({
        force: opts.force,
        profile: opts.profile,
        logger,
        pluginConfig,
      });
    });

  // diffraction diffraction connect
  diffraction
    .command("connect")
    .description("Open an interactive shell inside the Diffraction sandbox")
    .option("--sandbox <name>", "Sandbox name to connect to", pluginConfig.sandboxName)
    .action(async (opts: { sandbox: string }) => {
      await cliConnect({ sandbox: opts.sandbox, logger });
    });

  // diffraction diffraction logs
  diffraction
    .command("logs")
    .description("Stream blueprint execution and sandbox logs")
    .option("-f, --follow", "Follow log output", false)
    .option("-n, --lines <count>", "Number of lines to show", "50")
    .option("--run-id <id>", "Show logs for a specific blueprint run")
    .action(async (opts: { follow: boolean; lines: string; runId?: string }) => {
      await cliLogs({
        follow: opts.follow,
        lines: parseInt(opts.lines, 10),
        runId: opts.runId,
        logger,
        pluginConfig,
      });
    });

  // diffraction diffraction eject
  diffraction
    .command("eject")
    .description("Rollback from OpenShell and restore host installation")
    .option("--run-id <id>", "Specific blueprint run ID to rollback from")
    .option("--confirm", "Skip confirmation prompt", false)
    .action(async (opts: { runId?: string; confirm: boolean }) => {
      await cliEject({
        runId: opts.runId,
        confirm: opts.confirm,
        logger,
        pluginConfig,
      });
    });

  // diffraction diffraction onboard
  diffraction
    .command("onboard")
    .description("Interactive setup: configure inference endpoint, credential, and model")
    .option("--api-key <key>", "API key for endpoints that require one (skips prompt)")
    .option("--endpoint <type>", "Endpoint type: build, ncp, ollama, nim-local, vllm, custom (nim-local and vllm are experimental)")
    .option("--ncp-partner <name>", "NCP partner name (when endpoint is ncp)")
    .option("--endpoint-url <url>", "Endpoint URL (for ncp, nim-local, ollama, or custom)")
    .option("--model <model>", "Model ID to use")
    .action(
      async (opts: {
        apiKey?: string;
        endpoint?: string;
        ncpPartner?: string;
        endpointUrl?: string;
        model?: string;
      }) => {
        await cliOnboard({
          apiKey: opts.apiKey,
          endpoint: opts.endpoint,
          ncpPartner: opts.ncpPartner,
          endpointUrl: opts.endpointUrl,
          model: opts.model,
          logger,
          pluginConfig,
        });
      },
    );
}
