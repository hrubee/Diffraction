import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#diffraction",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#diffraction",
      rawTarget: "#diffraction",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "diffraction-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "diffraction-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "diffraction-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "diffraction-bot",
      rawTarget: "diffraction-bot",
    });
  });
});
