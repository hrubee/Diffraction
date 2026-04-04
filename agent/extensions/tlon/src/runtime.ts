import type { PluginRuntime } from "diffraction/plugin-sdk/plugin-runtime";
import { createPluginRuntimeStore } from "diffraction/plugin-sdk/runtime-store";

const { setRuntime: setTlonRuntime, getRuntime: getTlonRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Tlon runtime not initialized");
export { getTlonRuntime, setTlonRuntime };
