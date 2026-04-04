import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  CreateSandboxBackendParams,
  DiffractConfig,
  RemoteShellSandboxHandle,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxBackendFactory,
  SandboxBackendHandle,
  SandboxBackendManager,
  SshSandboxSession,
} from "diffraction/plugin-sdk/sandbox";
import {
  createRemoteShellSandboxFsBridge,
  disposeSshSandboxSession,
  resolvePreferredDiffractTmpDir,
  runSshSandboxCommand,
} from "diffraction/plugin-sdk/sandbox";
import {
  buildExecRemoteCommand,
  buildRemoteCommand,
  createDiffractSshSession,
  runDiffractCli,
  type DiffractExecContext,
} from "./cli.js";
import { resolveDiffractPluginConfig, type ResolvedDiffractPluginConfig } from "./config.js";
import { createDiffractFsBridge } from "./fs-bridge.js";
import { replaceDirectoryContents } from "./mirror.js";

type CreateDiffractSandboxBackendFactoryParams = {
  pluginConfig: ResolvedDiffractPluginConfig;
};

type PendingExec = {
  sshSession: SshSandboxSession;
};

export type DiffractSandboxBackend = SandboxBackendHandle &
  RemoteShellSandboxHandle & {
    mode: "mirror" | "remote";
    syncLocalPathToRemote(localPath: string, remotePath: string): Promise<void>;
  };

export function createDiffractSandboxBackendFactory(
  params: CreateDiffractSandboxBackendFactoryParams,
): SandboxBackendFactory {
  return async (createParams) =>
    await createDiffractSandboxBackend({
      ...params,
      createParams,
    });
}

export function createDiffractSandboxBackendManager(params: {
  pluginConfig: ResolvedDiffractPluginConfig;
}): SandboxBackendManager {
  return {
    async describeRuntime({ entry, config }) {
      const execContext: DiffractExecContext = {
        config: resolveDiffractPluginConfigFromConfig(config, params.pluginConfig),
        sandboxName: entry.containerName,
      };
      const result = await runDiffractCli({
        context: execContext,
        args: ["sandbox", "get", entry.containerName],
      });
      const configuredSource = execContext.config.from;
      return {
        running: result.code === 0,
        actualConfigLabel: entry.image,
        configLabelMatch: entry.image === configuredSource,
      };
    },
    async removeRuntime({ entry }) {
      const execContext: DiffractExecContext = {
        config: params.pluginConfig,
        sandboxName: entry.containerName,
      };
      await runDiffractCli({
        context: execContext,
        args: ["sandbox", "delete", entry.containerName],
      });
    },
  };
}

async function createDiffractSandboxBackend(params: {
  pluginConfig: ResolvedDiffractPluginConfig;
  createParams: CreateSandboxBackendParams;
}): Promise<DiffractSandboxBackend> {
  if ((params.createParams.cfg.docker.binds?.length ?? 0) > 0) {
    throw new Error("Diffract sandbox backend does not support sandbox.docker.binds.");
  }

  const sandboxName = buildDiffractSandboxName(params.createParams.scopeKey);
  const execContext: DiffractExecContext = {
    config: params.pluginConfig,
    sandboxName,
  };
  const impl = new DiffractSandboxBackendImpl({
    createParams: params.createParams,
    execContext,
    remoteWorkspaceDir: params.pluginConfig.remoteWorkspaceDir,
    remoteAgentWorkspaceDir: params.pluginConfig.remoteAgentWorkspaceDir,
  });

  return {
    id: "diffract",
    runtimeId: sandboxName,
    runtimeLabel: sandboxName,
    workdir: params.pluginConfig.remoteWorkspaceDir,
    env: params.createParams.cfg.docker.env,
    mode: params.pluginConfig.mode,
    configLabel: params.pluginConfig.from,
    configLabelKind: "Source",
    buildExecSpec: async ({ command, workdir, env, usePty }) => {
      const pending = await impl.prepareExec({ command, workdir, env, usePty });
      return {
        argv: pending.argv,
        env: process.env,
        stdinMode: "pipe-open",
        finalizeToken: pending.token,
      };
    },
    finalizeExec: async ({ token }) => {
      await impl.finalizeExec(token as PendingExec | undefined);
    },
    runShellCommand: async (command) => await impl.runRemoteShellScript(command),
    createFsBridge: ({ sandbox }) =>
      params.pluginConfig.mode === "remote"
        ? createRemoteShellSandboxFsBridge({
            sandbox,
            runtime: impl.asHandle(),
          })
        : createDiffractFsBridge({
            sandbox,
            backend: impl.asHandle(),
          }),
    remoteWorkspaceDir: params.pluginConfig.remoteWorkspaceDir,
    remoteAgentWorkspaceDir: params.pluginConfig.remoteAgentWorkspaceDir,
    runRemoteShellScript: async (command) => await impl.runRemoteShellScript(command),
    syncLocalPathToRemote: async (localPath, remotePath) =>
      await impl.syncLocalPathToRemote(localPath, remotePath),
  };
}

class DiffractSandboxBackendImpl {
  private ensurePromise: Promise<void> | null = null;
  private remoteSeedPending = false;

  constructor(
    private readonly params: {
      createParams: CreateSandboxBackendParams;
      execContext: DiffractExecContext;
      remoteWorkspaceDir: string;
      remoteAgentWorkspaceDir: string;
    },
  ) {}

  asHandle(): DiffractSandboxBackend {
    const self = this;
    return {
      id: "diffract",
      runtimeId: this.params.execContext.sandboxName,
      runtimeLabel: this.params.execContext.sandboxName,
      workdir: this.params.remoteWorkspaceDir,
      env: this.params.createParams.cfg.docker.env,
      mode: this.params.execContext.config.mode,
      configLabel: this.params.execContext.config.from,
      configLabelKind: "Source",
      remoteWorkspaceDir: this.params.remoteWorkspaceDir,
      remoteAgentWorkspaceDir: this.params.remoteAgentWorkspaceDir,
      buildExecSpec: async ({ command, workdir, env, usePty }) => {
        const pending = await self.prepareExec({ command, workdir, env, usePty });
        return {
          argv: pending.argv,
          env: process.env,
          stdinMode: "pipe-open",
          finalizeToken: pending.token,
        };
      },
      finalizeExec: async ({ token }) => {
        await self.finalizeExec(token as PendingExec | undefined);
      },
      runShellCommand: async (command) => await self.runRemoteShellScript(command),
      createFsBridge: ({ sandbox }) =>
        this.params.execContext.config.mode === "remote"
          ? createRemoteShellSandboxFsBridge({
              sandbox,
              runtime: self.asHandle(),
            })
          : createDiffractFsBridge({
              sandbox,
              backend: self.asHandle(),
            }),
      runRemoteShellScript: async (command) => await self.runRemoteShellScript(command),
      syncLocalPathToRemote: async (localPath, remotePath) =>
        await self.syncLocalPathToRemote(localPath, remotePath),
    };
  }

  async prepareExec(params: {
    command: string;
    workdir?: string;
    env: Record<string, string>;
    usePty: boolean;
  }): Promise<{ argv: string[]; token: PendingExec }> {
    await this.ensureSandboxExists();
    if (this.params.execContext.config.mode === "mirror") {
      await this.syncWorkspaceToRemote();
    } else {
      await this.maybeSeedRemoteWorkspace();
    }
    const sshSession = await createDiffractSshSession({
      context: this.params.execContext,
    });
    const remoteCommand = buildExecRemoteCommand({
      command: params.command,
      workdir: params.workdir ?? this.params.remoteWorkspaceDir,
      env: params.env,
    });
    return {
      argv: [
        "ssh",
        "-F",
        sshSession.configPath,
        ...(params.usePty
          ? ["-tt", "-o", "RequestTTY=force", "-o", "SetEnv=TERM=xterm-256color"]
          : ["-T", "-o", "RequestTTY=no"]),
        sshSession.host,
        remoteCommand,
      ],
      token: { sshSession },
    };
  }

  async finalizeExec(token?: PendingExec): Promise<void> {
    try {
      if (this.params.execContext.config.mode === "mirror") {
        await this.syncWorkspaceFromRemote();
      }
    } finally {
      if (token?.sshSession) {
        await disposeSshSandboxSession(token.sshSession);
      }
    }
  }

  async runRemoteShellScript(
    params: SandboxBackendCommandParams,
  ): Promise<SandboxBackendCommandResult> {
    await this.ensureSandboxExists();
    await this.maybeSeedRemoteWorkspace();
    return await this.runRemoteShellScriptInternal(params);
  }

  private async runRemoteShellScriptInternal(
    params: SandboxBackendCommandParams,
  ): Promise<SandboxBackendCommandResult> {
    const session = await createDiffractSshSession({
      context: this.params.execContext,
    });
    try {
      return await runSshSandboxCommand({
        session,
        remoteCommand: buildRemoteCommand([
          "/bin/sh",
          "-c",
          params.script,
          "diffraction-diffract-fs",
          ...(params.args ?? []),
        ]),
        stdin: params.stdin,
        allowFailure: params.allowFailure,
        signal: params.signal,
      });
    } finally {
      await disposeSshSandboxSession(session);
    }
  }

  async syncLocalPathToRemote(localPath: string, remotePath: string): Promise<void> {
    await this.ensureSandboxExists();
    await this.maybeSeedRemoteWorkspace();
    const stats = await fs.lstat(localPath).catch(() => null);
    if (!stats) {
      await this.runRemoteShellScript({
        script: 'rm -rf -- "$1"',
        args: [remotePath],
        allowFailure: true,
      });
      return;
    }
    if (stats.isDirectory()) {
      await this.runRemoteShellScript({
        script: 'mkdir -p -- "$1"',
        args: [remotePath],
      });
      return;
    }
    await this.runRemoteShellScript({
      script: 'mkdir -p -- "$(dirname -- "$1")"',
      args: [remotePath],
    });
    const result = await runDiffractCli({
      context: this.params.execContext,
      args: [
        "sandbox",
        "upload",
        "--no-git-ignore",
        this.params.execContext.sandboxName,
        localPath,
        path.posix.dirname(remotePath),
      ],
      cwd: this.params.createParams.workspaceDir,
    });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || "diffract sandbox upload failed");
    }
  }

  private async ensureSandboxExists(): Promise<void> {
    if (this.ensurePromise) {
      return await this.ensurePromise;
    }
    this.ensurePromise = this.ensureSandboxExistsInner();
    try {
      await this.ensurePromise;
    } catch (error) {
      this.ensurePromise = null;
      throw error;
    }
  }

  private async ensureSandboxExistsInner(): Promise<void> {
    const getResult = await runDiffractCli({
      context: this.params.execContext,
      args: ["sandbox", "get", this.params.execContext.sandboxName],
      cwd: this.params.createParams.workspaceDir,
    });
    if (getResult.code === 0) {
      return;
    }
    const createArgs = [
      "sandbox",
      "create",
      "--name",
      this.params.execContext.sandboxName,
      "--from",
      this.params.execContext.config.from,
      ...(this.params.execContext.config.policy
        ? ["--policy", this.params.execContext.config.policy]
        : []),
      ...(this.params.execContext.config.gpu ? ["--gpu"] : []),
      ...(this.params.execContext.config.autoProviders
        ? ["--auto-providers"]
        : ["--no-auto-providers"]),
      ...this.params.execContext.config.providers.flatMap((provider) => ["--provider", provider]),
      "--",
      "true",
    ];
    const createResult = await runDiffractCli({
      context: this.params.execContext,
      args: createArgs,
      cwd: this.params.createParams.workspaceDir,
      timeoutMs: Math.max(this.params.execContext.config.timeoutMs, 300_000),
    });
    if (createResult.code !== 0) {
      throw new Error(createResult.stderr.trim() || "diffract sandbox create failed");
    }
    this.remoteSeedPending = true;
  }

  private async syncWorkspaceToRemote(): Promise<void> {
    await this.runRemoteShellScriptInternal({
      script: 'mkdir -p -- "$1" && find "$1" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +',
      args: [this.params.remoteWorkspaceDir],
    });
    await this.uploadPathToRemote(
      this.params.createParams.workspaceDir,
      this.params.remoteWorkspaceDir,
    );

    if (
      this.params.createParams.cfg.workspaceAccess !== "none" &&
      path.resolve(this.params.createParams.agentWorkspaceDir) !==
        path.resolve(this.params.createParams.workspaceDir)
    ) {
      await this.runRemoteShellScriptInternal({
        script: 'mkdir -p -- "$1" && find "$1" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +',
        args: [this.params.remoteAgentWorkspaceDir],
      });
      await this.uploadPathToRemote(
        this.params.createParams.agentWorkspaceDir,
        this.params.remoteAgentWorkspaceDir,
      );
    }
  }

  private async syncWorkspaceFromRemote(): Promise<void> {
    const tmpDir = await fs.mkdtemp(
      path.join(resolveDiffractTmpRoot(), "diffraction-diffract-sync-"),
    );
    try {
      const result = await runDiffractCli({
        context: this.params.execContext,
        args: [
          "sandbox",
          "download",
          this.params.execContext.sandboxName,
          this.params.remoteWorkspaceDir,
          tmpDir,
        ],
        cwd: this.params.createParams.workspaceDir,
      });
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || "diffract sandbox download failed");
      }
      await replaceDirectoryContents({
        sourceDir: tmpDir,
        targetDir: this.params.createParams.workspaceDir,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async uploadPathToRemote(localPath: string, remotePath: string): Promise<void> {
    const result = await runDiffractCli({
      context: this.params.execContext,
      args: [
        "sandbox",
        "upload",
        "--no-git-ignore",
        this.params.execContext.sandboxName,
        localPath,
        remotePath,
      ],
      cwd: this.params.createParams.workspaceDir,
    });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || "diffract sandbox upload failed");
    }
  }

  private async maybeSeedRemoteWorkspace(): Promise<void> {
    if (!this.remoteSeedPending) {
      return;
    }
    this.remoteSeedPending = false;
    try {
      await this.syncWorkspaceToRemote();
    } catch (error) {
      this.remoteSeedPending = true;
      throw error;
    }
  }
}

function resolveDiffractPluginConfigFromConfig(
  config: DiffractConfig,
  fallback: ResolvedDiffractPluginConfig,
): ResolvedDiffractPluginConfig {
  const pluginConfig = config.plugins?.entries?.diffract?.config;
  if (!pluginConfig) {
    return fallback;
  }
  return resolveDiffractPluginConfig(pluginConfig);
}

function buildDiffractSandboxName(scopeKey: string): string {
  const trimmed = scopeKey.trim() || "session";
  const safe = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const hash = Array.from(trimmed).reduce(
    (acc, char) => ((acc * 33) ^ char.charCodeAt(0)) >>> 0,
    5381,
  );
  return `diffraction-${safe || "session"}-${hash.toString(16).slice(0, 8)}`;
}

function resolveDiffractTmpRoot(): string {
  return path.resolve(resolvePreferredDiffractTmpDir() ?? os.tmpdir());
}
