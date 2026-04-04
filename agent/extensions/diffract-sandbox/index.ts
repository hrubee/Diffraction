import type { DiffractPluginApi } from "diffraction/plugin-sdk/core";
import { registerSandboxBackend } from "diffraction/plugin-sdk/sandbox";
import {
  createDiffractSandboxBackendFactory,
  createDiffractSandboxBackendManager,
} from "./src/backend.js";
import { createDiffractPluginConfigSchema, resolveDiffractPluginConfig } from "./src/config.js";

const plugin = {
  id: "diffract",
  name: "Diffract Sandbox",
  description: "Diffract-backed sandbox runtime for agent exec and file tools.",
  configSchema: createDiffractPluginConfigSchema(),
  register(api: DiffractPluginApi) {
    if (api.registrationMode !== "full") {
      return;
    }
    const pluginConfig = resolveDiffractPluginConfig(api.pluginConfig);
    registerSandboxBackend("diffract", {
      factory: createDiffractSandboxBackendFactory({
        pluginConfig,
      }),
      manager: createDiffractSandboxBackendManager({
        pluginConfig,
      }),
    });
  },
};

export default plugin;
