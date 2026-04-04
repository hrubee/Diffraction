import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/extensions/plugin-api.js";
import plugin from "./index.js";
import type { DiffractionPluginApi } from "./runtime-api.js";

function createApi(
  registrationMode: DiffractionPluginApi["registrationMode"],
  registerHttpRoute = vi.fn(),
): DiffractionPluginApi {
  return createTestPluginApi({
    id: "mattermost",
    name: "Mattermost",
    source: "test",
    config: {},
    runtime: {} as DiffractionPluginApi["runtime"],
    registrationMode,
    registerHttpRoute,
  });
}

describe("mattermost plugin register", () => {
  it("skips slash callback registration in setup-only mode", () => {
    const registerHttpRoute = vi.fn();

    plugin.register(createApi("setup-only", registerHttpRoute));

    expect(registerHttpRoute).not.toHaveBeenCalled();
  });

  it("registers slash callback routes in full mode", () => {
    const registerHttpRoute = vi.fn();

    plugin.register(createApi("full", registerHttpRoute));

    expect(registerHttpRoute).toHaveBeenCalledTimes(1);
    expect(registerHttpRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/channels/mattermost/command",
        auth: "plugin",
      }),
    );
  });
});
