import { definePluginEntry } from "diffraction/plugin-sdk/plugin-entry";
import type { AnyAgentTool, DiffractionPluginApi, DiffractionPluginToolFactory } from "./runtime-api.js";
import { createLobsterTool } from "./src/lobster-tool.js";

export default definePluginEntry({
  id: "lobster",
  name: "Lobster",
  description: "Optional local shell helper tools",
  register(api: DiffractionPluginApi) {
    api.registerTool(
      ((ctx) => {
        if (ctx.sandboxed) {
          return null;
        }
        return createLobsterTool(api) as AnyAgentTool;
      }) as DiffractionPluginToolFactory,
      { optional: true },
    );
  },
});
