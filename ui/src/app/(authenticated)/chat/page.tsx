"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@/lib/use-chat";
import { useGateway } from "@/lib/use-gateway";
import { ChatMessage } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wifi, WifiOff } from "lucide-react";

export default function ChatPage() {
  const { connected } = useGateway();
  const { messages, streaming, sendMessage, abort } = useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold">Chat</h1>
        <Badge variant={connected ? "default" : "destructive"} className="gap-1">
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto py-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-20">
              <p className="text-lg font-medium mb-2">Welcome to Diffract</p>
              <p className="text-sm">Send a message to start chatting with the AI agent</p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              streaming={msg.streaming}
            />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        onAbort={abort}
        streaming={streaming}
        disabled={!connected}
      />
    </div>
  );
}
