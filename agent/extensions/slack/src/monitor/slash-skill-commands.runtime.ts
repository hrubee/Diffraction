import { listSkillCommandsForAgents as listSkillCommandsForAgentsImpl } from "diffraction/plugin-sdk/command-auth";

type ListSkillCommandsForAgents =
  typeof import("diffraction/plugin-sdk/command-auth").listSkillCommandsForAgents;

export function listSkillCommandsForAgents(
  ...args: Parameters<ListSkillCommandsForAgents>
): ReturnType<ListSkillCommandsForAgents> {
  return listSkillCommandsForAgentsImpl(...args);
}
