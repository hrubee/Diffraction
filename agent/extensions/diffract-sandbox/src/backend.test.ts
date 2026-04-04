import { describe, expect, it, vi, beforeEach } from "vitest";

const cliMocks = vi.hoisted(() => ({
  runDiffractCli: vi.fn(),
}));

vi.mock("./cli.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cli.js")>();
  return {
    ...actual,
    runDiffractCli: cliMocks.runDiffractCli,
  };
});

import { createDiffractSandboxBackendManager } from "./backend.js";
import { resolveDiffractPluginConfig } from "./config.js";

describe("diffract backend manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks runtime status with config override from Diffract config", async () => {
    cliMocks.runDiffractCli.mockResolvedValue({
      code: 0,
      stdout: "{}",
      stderr: "",
    });

    const manager = createDiffractSandboxBackendManager({
      pluginConfig: resolveDiffractPluginConfig({
        command: "diffract",
        from: "diffraction",
      }),
    });

    const result = await manager.describeRuntime({
      entry: {
        containerName: "diffraction-session-1234",
        backendId: "diffract",
        runtimeLabel: "diffraction-session-1234",
        sessionKey: "agent:main",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "custom-source",
        configLabelKind: "Source",
      },
      config: {
        plugins: {
          entries: {
            diffract: {
              enabled: true,
              config: {
                command: "diffract",
                from: "custom-source",
              },
            },
          },
        },
      },
    });

    expect(result).toEqual({
      running: true,
      actualConfigLabel: "custom-source",
      configLabelMatch: true,
    });
    expect(cliMocks.runDiffractCli).toHaveBeenCalledWith({
      context: expect.objectContaining({
        sandboxName: "diffraction-session-1234",
        config: expect.objectContaining({
          from: "custom-source",
        }),
      }),
      args: ["sandbox", "get", "diffraction-session-1234"],
    });
  });

  it("removes runtimes via diffract sandbox delete", async () => {
    cliMocks.runDiffractCli.mockResolvedValue({
      code: 0,
      stdout: "",
      stderr: "",
    });

    const manager = createDiffractSandboxBackendManager({
      pluginConfig: resolveDiffractPluginConfig({
        command: "/usr/local/bin/diffract",
        gateway: "lab",
      }),
    });

    await manager.removeRuntime({
      entry: {
        containerName: "diffraction-session-5678",
        backendId: "diffract",
        runtimeLabel: "diffraction-session-5678",
        sessionKey: "agent:main",
        createdAtMs: 1,
        lastUsedAtMs: 1,
        image: "diffraction",
        configLabelKind: "Source",
      },
      config: {},
    });

    expect(cliMocks.runDiffractCli).toHaveBeenCalledWith({
      context: expect.objectContaining({
        sandboxName: "diffraction-session-5678",
        config: expect.objectContaining({
          command: "/usr/local/bin/diffract",
          gateway: "lab",
        }),
      }),
      args: ["sandbox", "delete", "diffraction-session-5678"],
    });
  });
});
