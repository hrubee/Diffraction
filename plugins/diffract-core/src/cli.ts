// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * CLI registrar for `diffract diffract <subcommand>`.
 *
 * Wires commander.js subcommands to the existing blueprint infrastructure.
 */

import type { DiffractPluginApi, PluginCliContext } from "./index.js";
import { getPluginConfig } from "./index.js";
import { cliStatus } from "./commands/status.js";
import { cliMigrate } from "./commands/migrate.js";
import { cliLaunch } from "./commands/launch.js";
import { cliConnect } from "./commands/connect.js";
import { cliEject } from "./commands/eject.js";
import { cliLogs } from "./commands/logs.js";
import { cliOnboard } from "./commands/onboard.js";

export function registerCliCommands(ctx: PluginCliContext, api: DiffractPluginApi): void {
  const { program, logger } = ctx;
  const pluginConfig = getPluginConfig(api);

  const diffract = program.command("diffract").description("Diffract sandbox management");

  // diffract diffract status
  diffract
    .command("status")
    .description("Show sandbox, blueprint, and inference state")
    .option("--json", "Output as JSON", false)
    .action(async (opts: { json: boolean }) => {
      await cliStatus({ json: opts.json, logger, pluginConfig });
    });

  // diffract diffract migrate
  diffract
    .command("migrate")
    .description("Migrate host Diffract installation into an Diffract sandbox")
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

  // diffract diffract launch
  diffract
    .command("launch")
    .description("Fresh setup: bootstrap Diffract inside Diffract")
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

  // diffract diffract connect
  diffract
    .command("connect")
    .description("Open an interactive shell inside the Diffract sandbox")
    .option("--sandbox <name>", "Sandbox name to connect to", pluginConfig.sandboxName)
    .action(async (opts: { sandbox: string }) => {
      await cliConnect({ sandbox: opts.sandbox, logger });
    });

  // diffract diffract logs
  diffract
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

  // diffract diffract eject
  diffract
    .command("eject")
    .description("Rollback from Diffract and restore host installation")
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

  // diffract diffract onboard
  diffract
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
