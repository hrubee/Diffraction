import { afterEach, describe, expect, it } from "vitest";
import {
  buildExecRemoteCommand,
  buildDiffractBaseArgv,
  resolveDiffractCommand,
  setBundledDiffractCommandResolverForTest,
  shellEscape,
} from "./cli.js";
import { resolveDiffractPluginConfig } from "./config.js";

describe("diffract cli helpers", () => {
  afterEach(() => {
    setBundledDiffractCommandResolverForTest();
  });

  it("builds base argv with gateway overrides", () => {
    const config = resolveDiffractPluginConfig({
      command: "/usr/local/bin/diffract",
      gateway: "lab",
      gatewayEndpoint: "https://lab.example",
    });
    expect(buildDiffractBaseArgv(config)).toEqual([
      "/usr/local/bin/diffract",
      "--gateway",
      "lab",
      "--gateway-endpoint",
      "https://lab.example",
    ]);
  });

  it("prefers the bundled diffract command when available", () => {
    setBundledDiffractCommandResolverForTest(() => "/tmp/node_modules/.bin/diffract");
    const config = resolveDiffractPluginConfig(undefined);

    expect(resolveDiffractCommand("diffract")).toBe("/tmp/node_modules/.bin/diffract");
    expect(buildDiffractBaseArgv(config)).toEqual(["/tmp/node_modules/.bin/diffract"]);
  });

  it("falls back to the PATH command when no bundled diffract is present", () => {
    setBundledDiffractCommandResolverForTest(() => null);

    expect(resolveDiffractCommand("diffract")).toBe("diffract");
  });

  it("shell escapes single quotes", () => {
    expect(shellEscape(`a'b`)).toBe(`'a'"'"'b'`);
  });

  it("wraps exec commands with env and workdir", () => {
    const command = buildExecRemoteCommand({
      command: "pwd && printenv TOKEN",
      workdir: "/sandbox/project",
      env: {
        TOKEN: "abc 123",
      },
    });
    expect(command).toContain(`'env'`);
    expect(command).toContain(`'TOKEN=abc 123'`);
    expect(command).toContain(`'cd '"'"'/sandbox/project'"'"' && pwd && printenv TOKEN'`);
  });
});
