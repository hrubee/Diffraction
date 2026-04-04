import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getCommandPositionalsWithRootOptions,
  getCommandPathWithRootOptions,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  isRootHelpInvocation,
  isRootVersionInvocation,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "diffraction", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "diffraction", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "diffraction", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "diffraction", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "diffraction", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "diffraction", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "diffraction", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "diffraction", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "diffraction", "--dev", "skills", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --version",
      argv: ["node", "diffraction", "--version"],
      expected: true,
    },
    {
      name: "root -V",
      argv: ["node", "diffraction", "-V"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "diffraction", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "subcommand version flag",
      argv: ["node", "diffraction", "status", "--version"],
      expected: false,
    },
    {
      name: "unknown root flag with version",
      argv: ["node", "diffraction", "--unknown", "--version"],
      expected: false,
    },
  ])("detects root-only version invocations: $name", ({ argv, expected }) => {
    expect(isRootVersionInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --help",
      argv: ["node", "diffraction", "--help"],
      expected: true,
    },
    {
      name: "root -h",
      argv: ["node", "diffraction", "-h"],
      expected: true,
    },
    {
      name: "root --help with profile",
      argv: ["node", "diffraction", "--profile", "work", "--help"],
      expected: true,
    },
    {
      name: "subcommand --help",
      argv: ["node", "diffraction", "status", "--help"],
      expected: false,
    },
    {
      name: "help before subcommand token",
      argv: ["node", "diffraction", "--help", "status"],
      expected: false,
    },
    {
      name: "help after -- terminator",
      argv: ["node", "diffraction", "nodes", "run", "--", "git", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag before help",
      argv: ["node", "diffraction", "--unknown", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag after help",
      argv: ["node", "diffraction", "--help", "--unknown"],
      expected: false,
    },
  ])("detects root-only help invocations: $name", ({ argv, expected }) => {
    expect(isRootHelpInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "diffraction", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "diffraction", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "diffraction", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it("extracts command path while skipping known root option values", () => {
    expect(
      getCommandPathWithRootOptions(
        ["node", "diffraction", "--profile", "work", "--no-color", "config", "validate"],
        2,
      ),
    ).toEqual(["config", "validate"]);
  });

  it("extracts routed config get positionals with interleaved root options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "diffraction", "config", "get", "--log-level", "debug", "update.channel", "--json"],
        {
          commandPath: ["config", "get"],
          booleanFlags: ["--json"],
        },
      ),
    ).toEqual(["update.channel"]);
  });

  it("extracts routed config unset positionals with interleaved root options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "diffraction", "config", "unset", "--profile", "work", "update.channel"],
        {
          commandPath: ["config", "unset"],
        },
      ),
    ).toEqual(["update.channel"]);
  });

  it("returns null when routed command sees unknown options", () => {
    expect(
      getCommandPositionalsWithRootOptions(
        ["node", "diffraction", "config", "get", "--mystery", "value", "update.channel"],
        {
          commandPath: ["config", "get"],
          booleanFlags: ["--json"],
        },
      ),
    ).toBeNull();
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "diffraction", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "diffraction"],
      expected: null,
    },
    {
      name: "skips known root option values",
      argv: ["node", "diffraction", "--log-level", "debug", "status"],
      expected: "status",
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "diffraction", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "diffraction", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "diffraction", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "diffraction", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "diffraction", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "diffraction", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "diffraction", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "diffraction", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "diffraction", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "diffraction", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "diffraction", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "diffraction", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "diffraction", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "diffraction", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "diffraction", "status"],
        expected: ["node", "diffraction", "status"],
      },
      {
        rawArgs: ["node-22", "diffraction", "status"],
        expected: ["node-22", "diffraction", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "diffraction", "status"],
        expected: ["node-22.2.0.exe", "diffraction", "status"],
      },
      {
        rawArgs: ["node-22.2", "diffraction", "status"],
        expected: ["node-22.2", "diffraction", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "diffraction", "status"],
        expected: ["node-22.2.exe", "diffraction", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "diffraction", "status"],
        expected: ["/usr/bin/node-22.2.0", "diffraction", "status"],
      },
      {
        rawArgs: ["node24", "diffraction", "status"],
        expected: ["node24", "diffraction", "status"],
      },
      {
        rawArgs: ["/usr/bin/node24", "diffraction", "status"],
        expected: ["/usr/bin/node24", "diffraction", "status"],
      },
      {
        rawArgs: ["node24.exe", "diffraction", "status"],
        expected: ["node24.exe", "diffraction", "status"],
      },
      {
        rawArgs: ["nodejs", "diffraction", "status"],
        expected: ["nodejs", "diffraction", "status"],
      },
      {
        rawArgs: ["node-dev", "diffraction", "status"],
        expected: ["node", "diffraction", "node-dev", "diffraction", "status"],
      },
      {
        rawArgs: ["diffraction", "status"],
        expected: ["node", "diffraction", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "diffraction",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "diffraction",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "diffraction", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "diffraction", "status"],
      ["node", "diffraction", "health"],
      ["node", "diffraction", "sessions"],
      ["node", "diffraction", "config", "get", "update"],
      ["node", "diffraction", "config", "unset", "update"],
      ["node", "diffraction", "models", "list"],
      ["node", "diffraction", "models", "status"],
      ["node", "diffraction", "memory", "status"],
      ["node", "diffraction", "update", "status", "--json"],
      ["node", "diffraction", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "diffraction", "agents", "list"],
      ["node", "diffraction", "message", "send"],
    ] as const;

    for (const argv of nonMutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(false);
    }
    for (const argv of mutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(true);
    }
  });

  it.each([
    { path: ["status"], expected: false },
    { path: ["update", "status"], expected: false },
    { path: ["config", "get"], expected: false },
    { path: ["models", "status"], expected: false },
    { path: ["agents", "list"], expected: true },
  ])("reuses command path for migrate state decisions: $path", ({ path, expected }) => {
    expect(shouldMigrateStateFromPath(path)).toBe(expected);
  });
});
