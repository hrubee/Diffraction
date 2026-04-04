import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "diffraction",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "diffraction", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "diffraction", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "diffraction", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "diffraction", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "diffraction", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "diffraction", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it.each([
    ["--dev first", ["node", "diffraction", "--dev", "--profile", "work", "status"]],
    ["--profile first", ["node", "diffraction", "--profile", "work", "--dev", "status"]],
  ])("rejects combining --dev with --profile (%s)", (_name, argv) => {
    const res = parseCliProfileArgs(argv);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".diffraction-dev");
    expect(env.DIFFRACTION_PROFILE).toBe("dev");
    expect(env.DIFFRACTION_STATE_DIR).toBe(expectedStateDir);
    expect(env.DIFFRACTION_CONFIG_PATH).toBe(path.join(expectedStateDir, "diffraction.json"));
    expect(env.DIFFRACTION_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      DIFFRACTION_STATE_DIR: "/custom",
      DIFFRACTION_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.DIFFRACTION_STATE_DIR).toBe("/custom");
    expect(env.DIFFRACTION_GATEWAY_PORT).toBe("19099");
    expect(env.DIFFRACTION_CONFIG_PATH).toBe(path.join("/custom", "diffraction.json"));
  });

  it("uses DIFFRACTION_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      DIFFRACTION_HOME: "/srv/diffraction-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/diffraction-home");
    expect(env.DIFFRACTION_STATE_DIR).toBe(path.join(resolvedHome, ".diffraction-work"));
    expect(env.DIFFRACTION_CONFIG_PATH).toBe(
      path.join(resolvedHome, ".diffraction-work", "diffraction.json"),
    );
  });
});

describe("formatCliCommand", () => {
  it.each([
    {
      name: "no profile is set",
      cmd: "diffraction doctor --fix",
      env: {},
      expected: "diffraction doctor --fix",
    },
    {
      name: "profile is default",
      cmd: "diffraction doctor --fix",
      env: { DIFFRACTION_PROFILE: "default" },
      expected: "diffraction doctor --fix",
    },
    {
      name: "profile is Default (case-insensitive)",
      cmd: "diffraction doctor --fix",
      env: { DIFFRACTION_PROFILE: "Default" },
      expected: "diffraction doctor --fix",
    },
    {
      name: "profile is invalid",
      cmd: "diffraction doctor --fix",
      env: { DIFFRACTION_PROFILE: "bad profile" },
      expected: "diffraction doctor --fix",
    },
    {
      name: "--profile is already present",
      cmd: "diffraction --profile work doctor --fix",
      env: { DIFFRACTION_PROFILE: "work" },
      expected: "diffraction --profile work doctor --fix",
    },
    {
      name: "--dev is already present",
      cmd: "diffraction --dev doctor",
      env: { DIFFRACTION_PROFILE: "dev" },
      expected: "diffraction --dev doctor",
    },
  ])("returns command unchanged when $name", ({ cmd, env, expected }) => {
    expect(formatCliCommand(cmd, env)).toBe(expected);
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("diffraction doctor --fix", { DIFFRACTION_PROFILE: "work" })).toBe(
      "diffraction --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("diffraction doctor --fix", { DIFFRACTION_PROFILE: "  jbdiffraction  " })).toBe(
      "diffraction --profile jbdiffraction doctor --fix",
    );
  });

  it("handles command with no args after diffraction", () => {
    expect(formatCliCommand("diffraction", { DIFFRACTION_PROFILE: "test" })).toBe(
      "diffraction --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm diffraction doctor", { DIFFRACTION_PROFILE: "work" })).toBe(
      "pnpm diffraction --profile work doctor",
    );
  });
});
