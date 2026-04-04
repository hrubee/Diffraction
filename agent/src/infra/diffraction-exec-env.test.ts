import { describe, expect, it } from "vitest";
import {
  ensureDiffractionExecMarkerOnProcess,
  markDiffractionExecEnv,
  DIFFRACTION_CLI_ENV_VALUE,
  DIFFRACTION_CLI_ENV_VAR,
} from "./diffraction-exec-env.js";

describe("markDiffractionExecEnv", () => {
  it("returns a cloned env object with the exec marker set", () => {
    const env = { PATH: "/usr/bin", DIFFRACTION_CLI: "0" };
    const marked = markDiffractionExecEnv(env);

    expect(marked).toEqual({
      PATH: "/usr/bin",
      DIFFRACTION_CLI: DIFFRACTION_CLI_ENV_VALUE,
    });
    expect(marked).not.toBe(env);
    expect(env.DIFFRACTION_CLI).toBe("0");
  });
});

describe("ensureDiffractionExecMarkerOnProcess", () => {
  it("mutates and returns the provided process env", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };

    expect(ensureDiffractionExecMarkerOnProcess(env)).toBe(env);
    expect(env[DIFFRACTION_CLI_ENV_VAR]).toBe(DIFFRACTION_CLI_ENV_VALUE);
  });

  it("defaults to mutating process.env when no env object is provided", () => {
    const previous = process.env[DIFFRACTION_CLI_ENV_VAR];
    delete process.env[DIFFRACTION_CLI_ENV_VAR];

    try {
      expect(ensureDiffractionExecMarkerOnProcess()).toBe(process.env);
      expect(process.env[DIFFRACTION_CLI_ENV_VAR]).toBe(DIFFRACTION_CLI_ENV_VALUE);
    } finally {
      if (previous === undefined) {
        delete process.env[DIFFRACTION_CLI_ENV_VAR];
      } else {
        process.env[DIFFRACTION_CLI_ENV_VAR] = previous;
      }
    }
  });
});
