// Keep the external runtime API light so Jiti callers can resolve Matrix config
// helpers without traversing the full plugin-sdk/runtime graph or bootstrapping
// matrix-js-sdk during plain runtime-api import.
export * from "./src/auth-precedence.js";
export * from "./helper-api.js";
export {
  assertHttpUrlTargetsPrivateNetwork,
  closeDispatcher,
  createPinnedDispatcher,
  resolvePinnedHostnameWithPolicy,
  ssrfPolicyFromAllowPrivateNetwork,
  type LookupFn,
  type SsrFPolicy,
} from "diffraction/plugin-sdk/ssrf-runtime";
export {
  setMatrixThreadBindingIdleTimeoutBySessionKey,
  setMatrixThreadBindingMaxAgeBySessionKey,
} from "./thread-bindings-runtime.js";
export { writeJsonFileAtomically } from "diffraction/plugin-sdk/json-store";
export type {
  ChannelDirectoryEntry,
  ChannelMessageActionContext,
  DiffractionConfig,
  PluginRuntime,
  RuntimeLogger,
  RuntimeEnv,
  WizardPrompter,
} from "diffraction/plugin-sdk/matrix";
export { formatZonedTimestamp } from "diffraction/plugin-sdk/matrix";
