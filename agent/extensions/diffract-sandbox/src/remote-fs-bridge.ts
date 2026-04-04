import {
  createRemoteShellSandboxFsBridge,
  type RemoteShellSandboxHandle,
  type SandboxContext,
  type SandboxFsBridge,
} from "diffraction/plugin-sdk/sandbox";

export function createDiffractRemoteFsBridge(params: {
  sandbox: SandboxContext;
  backend: RemoteShellSandboxHandle;
}): SandboxFsBridge {
  return createRemoteShellSandboxFsBridge({
    sandbox: params.sandbox,
    runtime: params.backend,
  });
}
