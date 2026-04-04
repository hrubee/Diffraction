import type { DiffractionConfig } from "../../config/config.js";

type AgentToolsConfig = NonNullable<NonNullable<DiffractionConfig["agents"]>["list"]>[number]["tools"];
type SandboxToolsConfig = {
  allow?: string[];
  deny?: string[];
};

export function createRestrictedAgentSandboxConfig(params: {
  agentTools?: AgentToolsConfig;
  globalSandboxTools?: SandboxToolsConfig;
  workspace?: string;
}): DiffractionConfig {
  return {
    agents: {
      defaults: {
        sandbox: {
          mode: "all",
          scope: "agent",
        },
      },
      list: [
        {
          id: "restricted",
          workspace: params.workspace ?? "~/diffraction-restricted",
          sandbox: {
            mode: "all",
            scope: "agent",
          },
          ...(params.agentTools ? { tools: params.agentTools } : {}),
        },
      ],
    },
    ...(params.globalSandboxTools
      ? {
          tools: {
            sandbox: {
              tools: params.globalSandboxTools,
            },
          },
        }
      : {}),
  } as DiffractionConfig;
}
