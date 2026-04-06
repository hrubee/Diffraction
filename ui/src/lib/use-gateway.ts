"use client";

import { useEffect, useRef, useState } from "react";

const GATEWAY_WS_PATH = "/gateway-ws";
const RECONNECT_DELAY_MS = 3000;

/**
 * Connects to the Diffract gateway WebSocket at /gateway-ws and
 * exposes a `connected` boolean that reflects the live connection state.
 */
export function useGateway(): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}${GATEWAY_WS_PATH}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmountedRef.current) setConnected(true);
      };

      ws.onclose = () => {
        if (!unmountedRef.current) {
          setConnected(false);
          timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { connected };
}
