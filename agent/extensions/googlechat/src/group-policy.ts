import { resolveChannelGroupRequireMention } from "diffraction/plugin-sdk/channel-policy";
import type { DiffractionConfig } from "diffraction/plugin-sdk/core";

type GoogleChatGroupContext = {
  cfg: DiffractionConfig;
  accountId?: string | null;
  groupId?: string | null;
};

export function resolveGoogleChatGroupRequireMention(params: GoogleChatGroupContext): boolean {
  return resolveChannelGroupRequireMention({
    cfg: params.cfg,
    channel: "googlechat",
    groupId: params.groupId,
    accountId: params.accountId,
  });
}
