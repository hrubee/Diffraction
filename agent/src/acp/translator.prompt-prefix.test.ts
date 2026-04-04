import os from "node:os";
import path from "node:path";
import type { PromptRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import { createInMemorySessionStore } from "./session.js";
import { AcpGatewayAgent } from "./translator.js";
import { createAcpConnection, createAcpGateway } from "./translator.test-helpers.js";

const TEST_SESSION_ID = "session-1";
const TEST_SESSION_KEY = "agent:main:main";
const TEST_PROMPT = {
  sessionId: TEST_SESSION_ID,
  prompt: [{ type: "text", text: "hello" }],
  _meta: {},
} as unknown as PromptRequest;

describe("acp prompt cwd prefix", () => {
  const createStopAfterSendSpy = () =>
    vi.fn(async (method: string) => {
      if (method === "chat.send") {
        throw new Error("stop-after-send");
      }
      return {};
    });

  async function runPromptAndCaptureRequest(
    options: {
      cwd?: string;
      prefixCwd?: boolean;
      provenanceMode?: "meta" | "meta+receipt";
    } = {},
  ) {
    const sessionStore = createInMemorySessionStore();
    sessionStore.createSession({
      sessionId: TEST_SESSION_ID,
      sessionKey: TEST_SESSION_KEY,
      cwd: options.cwd ?? path.join(os.homedir(), "diffraction-test"),
    });

    const requestSpy = createStopAfterSendSpy();
    const agent = new AcpGatewayAgent(
      createAcpConnection(),
      createAcpGateway(requestSpy as unknown as GatewayClient["request"]),
      {
        sessionStore,
        prefixCwd: options.prefixCwd,
        provenanceMode: options.provenanceMode,
      },
    );

    await expect(agent.prompt(TEST_PROMPT)).rejects.toThrow("stop-after-send");
    return requestSpy;
  }

  async function runPromptWithCwd(cwd: string) {
    const pinnedHome = os.homedir();
    const previousDiffractionHome = process.env.DIFFRACTION_HOME;
    const previousHome = process.env.HOME;
    delete process.env.DIFFRACTION_HOME;
    process.env.HOME = pinnedHome;

    try {
      return await runPromptAndCaptureRequest({ cwd, prefixCwd: true });
    } finally {
      if (previousDiffractionHome === undefined) {
        delete process.env.DIFFRACTION_HOME;
      } else {
        process.env.DIFFRACTION_HOME = previousDiffractionHome;
      }
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  }

  it("redacts home directory in prompt prefix", async () => {
    const requestSpy = await runPromptWithCwd(path.join(os.homedir(), "diffraction-test"));
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        message: expect.stringMatching(/\[Working directory: ~[\\/]diffraction-test\]/),
      }),
      { expectFinal: true },
    );
  });

  it("keeps backslash separators when cwd uses them", async () => {
    const requestSpy = await runPromptWithCwd(`${os.homedir()}\\diffraction-test`);
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        message: expect.stringContaining("[Working directory: ~\\diffraction-test]"),
      }),
      { expectFinal: true },
    );
  });

  it("injects system provenance metadata when enabled", async () => {
    const requestSpy = await runPromptAndCaptureRequest({ provenanceMode: "meta" });
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemInputProvenance: {
          kind: "external_user",
          originSessionId: TEST_SESSION_ID,
          sourceChannel: "acp",
          sourceTool: "diffraction_acp",
        },
        systemProvenanceReceipt: undefined,
      }),
      { expectFinal: true },
    );
  });

  it("injects a system provenance receipt when requested", async () => {
    const requestSpy = await runPromptAndCaptureRequest({ provenanceMode: "meta+receipt" });
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemInputProvenance: {
          kind: "external_user",
          originSessionId: TEST_SESSION_ID,
          sourceChannel: "acp",
          sourceTool: "diffraction_acp",
        },
        systemProvenanceReceipt: expect.stringContaining("[Source Receipt]"),
      }),
      { expectFinal: true },
    );
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemProvenanceReceipt: expect.stringContaining("bridge=diffraction-acp"),
      }),
      { expectFinal: true },
    );
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemProvenanceReceipt: expect.stringContaining(`originSessionId=${TEST_SESSION_ID}`),
      }),
      { expectFinal: true },
    );
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemProvenanceReceipt: expect.stringContaining(`targetSession=${TEST_SESSION_KEY}`),
      }),
      { expectFinal: true },
    );
  });
});
