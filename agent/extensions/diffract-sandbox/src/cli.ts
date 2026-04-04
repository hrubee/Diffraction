import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  buildExecRemoteCommand,
  createSshSandboxSessionFromConfigText,
  runPluginCommandWithTimeout,
  shellEscape,
  type SshSandboxSession,
} from "diffraction/plugin-sdk/sandbox";
import type { ResolvedDiffractPluginConfig } from "./config.js";

export { buildExecRemoteCommand, shellEscape } from "diffraction/plugin-sdk/sandbox";

const require = createRequire(import.meta.url);

let cachedBundledDiffractCommand: string | null | undefined;
let bundledCommandResolverForTest: (() => string | null) | undefined;

export type DiffractExecContext = {
  config: ResolvedDiffractPluginConfig;
  sandboxName: string;
  timeoutMs?: number;
};

export function setBundledDiffractCommandResolverForTest(resolver?: () => string | null): void {
  bundledCommandResolverForTest = resolver;
  cachedBundledDiffractCommand = undefined;
}

function resolveBundledDiffractCommand(): string | null {
  if (bundledCommandResolverForTest) {
    return bundledCommandResolverForTest();
  }
  if (cachedBundledDiffractCommand !== undefined) {
    return cachedBundledDiffractCommand;
  }
  try {
    const packageJsonPath = require.resolve("diffract/package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const relativeBin =
      typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.diffract;
    cachedBundledDiffractCommand = relativeBin
      ? path.resolve(path.dirname(packageJsonPath), relativeBin)
      : null;
  } catch {
    cachedBundledDiffractCommand = null;
  }
  return cachedBundledDiffractCommand;
}

export function resolveDiffractCommand(command: string): string {
  if (command !== "diffract") {
    return command;
  }
  return resolveBundledDiffractCommand() ?? command;
}

export function buildDiffractBaseArgv(config: ResolvedDiffractPluginConfig): string[] {
  const argv = [resolveDiffractCommand(config.command)];
  if (config.gateway) {
    argv.push("--gateway", config.gateway);
  }
  if (config.gatewayEndpoint) {
    argv.push("--gateway-endpoint", config.gatewayEndpoint);
  }
  return argv;
}

export function buildRemoteCommand(argv: string[]): string {
  return argv.map((entry) => shellEscape(entry)).join(" ");
}

export async function runDiffractCli(params: {
  context: DiffractExecContext;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  return await runPluginCommandWithTimeout({
    argv: [...buildDiffractBaseArgv(params.context.config), ...params.args],
    cwd: params.cwd,
    timeoutMs: params.timeoutMs ?? params.context.timeoutMs ?? params.context.config.timeoutMs,
    env: process.env,
  });
}

export async function createDiffractSshSession(params: {
  context: DiffractExecContext;
}): Promise<SshSandboxSession> {
  const result = await runDiffractCli({
    context: params.context,
    args: ["sandbox", "ssh-config", params.context.sandboxName],
  });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "diffract sandbox ssh-config failed");
  }
  return await createSshSandboxSessionFromConfigText({
    configText: result.stdout,
  });
}
