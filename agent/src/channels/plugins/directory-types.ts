import type { DiffractionConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: DiffractionConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
