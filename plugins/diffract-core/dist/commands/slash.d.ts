/**
 * Handler for the /nemoclaw slash command (chat interface).
 *
 * Supports subcommands:
 *   /nemoclaw status   - show sandbox/blueprint/inference state
 *   /nemoclaw eject    - rollback to host installation
 *   /nemoclaw          - show help
 */
import type { PluginCommandContext, PluginCommandResult, DiffractPluginApi } from "../index.js";
export declare function handleSlashCommand(ctx: PluginCommandContext, _api: DiffractPluginApi): PluginCommandResult;
//# sourceMappingURL=slash.d.ts.map