"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatStatus } from "ai";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface UsePandoraChatOptions {
  /** WebSocket URL, e.g. "ws://localhost:3000/ws" */
  url: string;
  /** Auth token (appended as ?token=...) */
  token: string;
}

interface UsePandoraChatReturn {
  messages: ChatMessage[];
  status: ChatStatus;
  input: string;
  setInput: (value: string) => void;
  sendMessage: (content: string) => void;
  clearConversation: () => void;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}`;
}

export function usePandoraChat({
  url,
  token,
}: UsePandoraChatOptions): UsePandoraChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [input, setInput] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const streamingIdRef = useRef<string | null>(null);

  // Connect WebSocket
  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("ready");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        type: string;
        text?: string;
        message?: string;
      };

      switch (data.type) {
        case "delta": {
          const id = streamingIdRef.current;
          if (!id) break;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === id
                ? { ...msg, content: msg.content + (data.text ?? "") }
                : msg
            )
          );
          setStatus("streaming");
          break;
        }
        case "done": {
          streamingIdRef.current = null;
          setStatus("ready");
          break;
        }
        case "cleared": {
          setMessages([]);
          setStatus("ready");
          break;
        }
        case "error": {
          streamingIdRef.current = null;
          setStatus("error");
          break;
        }
      }
    };

    ws.onclose = () => {
      setStatus("error");
    };

    ws.onerror = () => {
      setStatus("error");
    };

    return () => {
      ws.close();
    };
  }, [url, token]);

  const sendMessage = useCallback(
    (content: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !content.trim()) return;

      // Add user message
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content: content.trim(),
      };

      // Add placeholder assistant message for streaming
      const assistantId = nextId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };

      streamingIdRef.current = assistantId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStatus("submitted");

      ws.send(JSON.stringify({ type: "message", content: content.trim() }));
    },
    []
  );

  const clearConversation = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "clear" }));
  }, []);

  return { messages, status, input, setInput, sendMessage, clearConversation };
}
