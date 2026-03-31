"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GatewayClient } from "./gateway-client";

interface GatewayContextValue {
  client: GatewayClient | null;
  connected: boolean;
  error: string | null;
}

const GatewayContext = createContext<GatewayContextValue>({
  client: null,
  connected: false,
  error: null,
});

export function GatewayProvider({
  token,
  wsUrl,
  children,
}: {
  token: string;
  wsUrl: string;
  children: ReactNode;
}) {
  const clientRef = useRef<GatewayClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = new GatewayClient(wsUrl, token);
    clientRef.current = client;

    client.onConnect = () => {
      setConnected(true);
      setError(null);
    };

    client.onDisconnect = (reason) => {
      setConnected(false);
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (clientRef.current === client) {
          client.connect();
        }
      }, 3000);
    };

    client.onError = (err) => {
      setError(err);
    };

    client.connect();

    return () => {
      clientRef.current = null;
      client.disconnect();
    };
  }, [token, wsUrl]);

  return (
    <GatewayContext.Provider value={{ client: clientRef.current, connected, error }}>
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway() {
  return useContext(GatewayContext);
}
