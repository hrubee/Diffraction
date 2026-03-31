"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGateway } from "./use-gateway";
import type { ChatMessage, EventFrame } from "./gateway-protocol";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  streaming?: boolean;
}

export function useChat(sessionKey = "main") {
  const { client, connected } = useGateway();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamBuffer = useRef("");
  const currentRunId = useRef<string | null>(null);

  // Subscribe to chat events
  useEffect(() => {
    if (!client) return;

    const unsubscribe = client.on("chat", (event: EventFrame) => {
      const payload = event.payload as Record<string, unknown> | undefined;
      if (!payload) return;

      const state = payload.state as string;
      const runId = payload.runId as string;
      const message = payload.message as ChatMessage | undefined;
      const delta = payload.delta as string | undefined;

      if (state === "delta" && delta) {
        streamBuffer.current += delta;
        currentRunId.current = runId;
        setStreaming(true);

        // Update the streaming message
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming && last.id === runId) {
            return [...prev.slice(0, -1), { ...last, content: streamBuffer.current }];
          }
          return [
            ...prev,
            {
              id: runId,
              role: "assistant",
              content: streamBuffer.current,
              timestamp: Date.now(),
              streaming: true,
            },
          ];
        });
      }

      if (state === "final" && message) {
        streamBuffer.current = "";
        currentRunId.current = null;
        setStreaming(false);

        setMessages((prev) => {
          // Replace the streaming message with the final one
          const withoutStreaming = prev.filter((m) => m.id !== runId);
          return [
            ...withoutStreaming,
            {
              id: runId,
              role: "assistant",
              content: message.content,
              timestamp: Date.now(),
              streaming: false,
            },
          ];
        });
      }

      if (state === "error") {
        streamBuffer.current = "";
        setStreaming(false);
        setMessages((prev) => [
          ...prev.filter((m) => !m.streaming),
          {
            id: runId || `error-${Date.now()}`,
            role: "assistant",
            content: `Error: ${(payload.error as string) || "Unknown error"}`,
            timestamp: Date.now(),
          },
        ]);
      }

      if (state === "aborted") {
        streamBuffer.current = "";
        setStreaming(false);
      }
    });

    return unsubscribe;
  }, [client]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!client || !connected || !text.trim()) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      streamBuffer.current = "";

      try {
        await client.sendRequest("chat.send", {
          sessionKey,
          messages: [{ role: "user", content: text.trim() }],
          deliver: false,
          idempotencyKey: userMsg.id,
        });
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `Failed to send: ${err instanceof Error ? err.message : "unknown"}`,
            timestamp: Date.now(),
          },
        ]);
      }
    },
    [client, connected, sessionKey]
  );

  const abort = useCallback(async () => {
    if (!client || !currentRunId.current) return;
    try {
      await client.sendRequest("chat.abort", { sessionKey });
    } catch {
      // Ignore abort errors
    }
  }, [client, sessionKey]);

  return { messages, streaming, sendMessage, abort, connected };
}
