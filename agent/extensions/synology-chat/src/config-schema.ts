import { buildChannelConfigSchema } from "diffraction/plugin-sdk/channel-config-schema";
import { z } from "zod";

export const SynologyChatChannelConfigSchema = buildChannelConfigSchema(
  z
    .object({
      dangerouslyAllowNameMatching: z.boolean().optional(),
    })
    .passthrough(),
);
