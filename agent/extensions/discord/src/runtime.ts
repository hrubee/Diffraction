import type { PluginRuntime } from "diffraction/plugin-sdk/core";
import { createPluginRuntimeStore } from "diffraction/plugin-sdk/runtime-store";

const { setRuntime: setDiscordRuntime, getRuntime: getDiscordRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Discord runtime not initialized");
export { getDiscordRuntime, setDiscordRuntime };
