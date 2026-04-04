import { describe, expect, it } from "vitest";
import { resolveDiffractPluginConfig } from "./config.js";

describe("diffract plugin config", () => {
  it("applies defaults", () => {
    expect(resolveDiffractPluginConfig(undefined)).toEqual({
      mode: "mirror",
      command: "diffract",
      gateway: undefined,
      gatewayEndpoint: undefined,
      from: "diffraction",
      policy: undefined,
      providers: [],
      gpu: false,
      autoProviders: true,
      remoteWorkspaceDir: "/sandbox",
      remoteAgentWorkspaceDir: "/agent",
      timeoutMs: 120_000,
    });
  });

  it("accepts remote mode", () => {
    expect(resolveDiffractPluginConfig({ mode: "remote" }).mode).toBe("remote");
  });

  it("rejects relative remote paths", () => {
    expect(() =>
      resolveDiffractPluginConfig({
        remoteWorkspaceDir: "sandbox",
      }),
    ).toThrow("Diffract remote path must be absolute");
  });

  it("rejects unknown mode", () => {
    expect(() =>
      resolveDiffractPluginConfig({
        mode: "bogus",
      }),
    ).toThrow("mode must be one of mirror, remote");
  });
});
