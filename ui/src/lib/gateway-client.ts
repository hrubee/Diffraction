// Simplified OpenClaw gateway WebSocket client for the Diffract UI.
// Handles connect challenge, token auth, request/response, and event streaming.

import type { Frame, ResponseFrame, EventFrame, ConnectParams } from "./gateway-protocol";

type EventHandler = (event: EventFrame) => void;
type PendingRequest = {
  resolve: (res: ResponseFrame) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class GatewayClient {
  private ws: WebSocket | null = null;
  private token: string;
  private wsUrl: string;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private connected = false;
  private msgSeq = 0;

  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (err: string) => void;

  constructor(wsUrl: string, token: string) {
    this.wsUrl = wsUrl;
    this.token = token;
  }

  connect() {
    if (this.ws) this.disconnect();

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      // Wait for connect.challenge event from server
    };

    this.ws.onmessage = (event) => {
      try {
        const frame: Frame = JSON.parse(event.data);
        this.handleFrame(frame);
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onerror = () => {
      this.onError?.("WebSocket error");
    };

    this.ws.onclose = (event) => {
      this.connected = false;
      this.onDisconnect?.(event.reason || "connection closed");
      // Reject all pending requests
      for (const [id, req] of this.pending) {
        clearTimeout(req.timer);
        req.reject(new Error("Connection closed"));
        this.pending.delete(id);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  private handleFrame(frame: Frame) {
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        // Respond with connect request
        this.sendConnect();
        return;
      }
      // Dispatch to event handlers
      const handlers = this.eventHandlers.get(frame.event);
      if (handlers) {
        for (const handler of handlers) handler(frame);
      }
      // Also dispatch to wildcard handlers
      const wildcardHandlers = this.eventHandlers.get("*");
      if (wildcardHandlers) {
        for (const handler of wildcardHandlers) handler(frame);
      }
      return;
    }

    if (frame.type === "res") {
      const req = this.pending.get(frame.id);
      if (req) {
        clearTimeout(req.timer);
        this.pending.delete(frame.id);

        // Check if this is the hello-ok response
        if (frame.ok && (frame.payload as Record<string, unknown>)?.type === "hello-ok") {
          this.connected = true;
          this.onConnect?.();
        }

        req.resolve(frame);
      }
    }
  }

  private sendConnect() {
    const params: ConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "diffract-ui",
        version: "0.1.0",
        platform: "web",
        mode: "webchat",
        displayName: "Diffract Dashboard",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write", "operator.admin", "operator.approvals"],
      caps: ["tool-events"],
      auth: { token: this.token },
      locale: navigator.language || "en-US",
    };

    this.sendRequest("connect", params as unknown as Record<string, unknown>);
  }

  private nextId(): string {
    return `ui-${++this.msgSeq}-${Date.now()}`;
  }

  sendRequest(method: string, params?: Record<string, unknown>): Promise<ResponseFrame> {
    return new Promise((resolve, reject) => {
      const id = this.nextId();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request '${method}' timed out`));
      }, 30000);

      this.pending.set(id, { resolve, reject, timer });

      const frame = { type: "req" as const, id, method, params };
      this.ws?.send(JSON.stringify(frame));
    });
  }

  on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  off(event: string, handler: EventHandler) {
    this.eventHandlers.get(event)?.delete(handler);
  }
}
