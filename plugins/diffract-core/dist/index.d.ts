/**
 * NemoClaw — Diffract Plugin for Diffract
 *
 * Uses the real Diffract plugin API. Types defined locally are minimal stubs
 * that match the Diffract SDK interfaces available at runtime via
 * `diffract/plugin-sdk`. We define them here because the SDK package is only
 * available inside the Diffract host process and cannot be imported at build
 * time.
 */
import type { Command } from "commander";
/** Subset of DiffractConfig that we actually read. */
export interface DiffractConfig {
    [key: string]: unknown;
}
/** Logger provided by the plugin host. */
export interface PluginLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
}
/** Context passed to slash-command handlers. */
export interface PluginCommandContext {
    senderId?: string;
    channel: string;
    isAuthorizedSender: boolean;
    args?: string;
    commandBody: string;
    config: DiffractConfig;
    from?: string;
    to?: string;
    accountId?: string;
}
/** Return value from a slash-command handler. */
export interface PluginCommandResult {
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
}
/** Registration shape for a slash command. */
export interface PluginCommandDefinition {
    name: string;
    description: string;
    acceptsArgs?: boolean;
    requireAuth?: boolean;
    handler: (ctx: PluginCommandContext) => PluginCommandResult | Promise<PluginCommandResult>;
}
/** Context passed to the CLI registrar callback. */
export interface PluginCliContext {
    program: Command;
    config: DiffractConfig;
    workspaceDir?: string;
    logger: PluginLogger;
}
/** CLI registrar callback type. */
export type PluginCliRegistrar = (ctx: PluginCliContext) => void | Promise<void>;
/** Auth method for a provider plugin. */
export interface ProviderAuthMethod {
    type: string;
    envVar?: string;
    headerName?: string;
    label?: string;
}
/** Model entry in a provider's model catalog. */
export interface ModelProviderEntry {
    id: string;
    label: string;
    contextWindow?: number;
    maxOutput?: number;
}
/** Model catalog shape. */
export interface ModelProviderConfig {
    chat?: ModelProviderEntry[];
    completion?: ModelProviderEntry[];
}
/** Registration shape for a custom model provider. */
export interface ProviderPlugin {
    id: string;
    label: string;
    docsPath?: string;
    aliases?: string[];
    envVars?: string[];
    models?: ModelProviderConfig;
    auth: ProviderAuthMethod[];
}
/** Background service registration. */
export interface PluginService {
    id: string;
    start: (ctx: {
        config: DiffractConfig;
        logger: PluginLogger;
    }) => void | Promise<void>;
    stop?: (ctx: {
        config: DiffractConfig;
        logger: PluginLogger;
    }) => void | Promise<void>;
}
/**
 * The API object injected into the plugin's register function by the Diffract
 * host. Only the methods we actually call are listed here.
 */
export interface DiffractPluginApi {
    id: string;
    name: string;
    version?: string;
    config: DiffractConfig;
    pluginConfig?: Record<string, unknown>;
    logger: PluginLogger;
    registerCommand: (command: PluginCommandDefinition) => void;
    registerCli: (registrar: PluginCliRegistrar, opts?: {
        commands?: string[];
    }) => void;
    registerProvider: (provider: ProviderPlugin) => void;
    registerService: (service: PluginService) => void;
    resolvePath: (input: string) => string;
    on: (hookName: string, handler: (...args: unknown[]) => void) => void;
}
export interface NemoClawConfig {
    blueprintVersion: string;
    blueprintRegistry: string;
    sandboxName: string;
    inferenceProvider: string;
}
export declare function getPluginConfig(api: DiffractPluginApi): NemoClawConfig;
export default function register(api: DiffractPluginApi): void;
//# sourceMappingURL=index.d.ts.map