export const DIFFRACTION_CLI_ENV_VAR = "DIFFRACTION_CLI";
export const DIFFRACTION_CLI_ENV_VALUE = "1";

export function markDiffractionExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [DIFFRACTION_CLI_ENV_VAR]: DIFFRACTION_CLI_ENV_VALUE,
  };
}

export function ensureDiffractionExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[DIFFRACTION_CLI_ENV_VAR] = DIFFRACTION_CLI_ENV_VALUE;
  return env;
}
