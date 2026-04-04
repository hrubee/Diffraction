import type { PluginRuntime } from "diffraction/plugin-sdk/core";
import { createPluginRuntimeStore } from "diffraction/plugin-sdk/runtime-store";

const { setRuntime: setSignalRuntime, getRuntime: getSignalRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Signal runtime not initialized");
export { getSignalRuntime, setSignalRuntime };
