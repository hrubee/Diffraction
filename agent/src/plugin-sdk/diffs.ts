// Narrow plugin-sdk surface for the bundled diffs plugin.
// Keep this list additive and scoped to symbols used under extensions/diffs.

export { definePluginEntry } from "./plugin-entry.js";
export type { DiffractionConfig } from "../config/config.js";
export { resolvePreferredDiffractionTmpDir } from "../infra/tmp-diffraction-dir.js";
export type {
  AnyAgentTool,
  DiffractionPluginApi,
  DiffractionPluginConfigSchema,
  DiffractionPluginToolContext,
  PluginLogger,
} from "../plugins/types.js";
