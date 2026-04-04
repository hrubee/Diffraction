import type { PluginRuntime } from "diffraction/plugin-sdk/core";
import { createPluginRuntimeStore } from "diffraction/plugin-sdk/runtime-store";

const { setRuntime: setTelegramRuntime, getRuntime: getTelegramRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Telegram runtime not initialized");
export { getTelegramRuntime, setTelegramRuntime };
