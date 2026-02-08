"use client";

import { useCallback, useState } from "react";
import { usePandoraChat } from "@/hooks/use-pandora-chat";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Suggestions,
  Suggestion,
} from "@/components/ai-elements/suggestion";
import { MessageSquareIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

const WS_URL = process.env.NEXT_PUBLIC_PANDORA_WS_URL ?? "ws://localhost:3000/ws";
const TOKEN = process.env.NEXT_PUBLIC_PANDORA_TOKEN ?? "";

const SUGGESTIONS = [
  "What can you help me with?",
  "Tell me a fun fact",
  "Explain quantum computing simply",
  "Write a short poem",
];

export default function Chat() {
  const [token, setToken] = useState(TOKEN);
  const [tokenInput, setTokenInput] = useState("");

  if (!token) {
    return <TokenPrompt value={tokenInput} onChange={setTokenInput} onSubmit={setToken} />;
  }

  return <ChatInterface wsUrl={WS_URL} token={token} onDisconnect={() => setToken("")} />;
}

function TokenPrompt({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (token: string) => void;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Pandora</h1>
          <p className="text-sm text-muted-foreground">Enter your auth token to connect</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) onSubmit(value.trim());
          }}
          className="flex flex-col gap-2"
        >
          <input
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Auth token"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            autoFocus
          />
          <Button type="submit" disabled={!value.trim()}>
            Connect
          </Button>
        </form>
      </div>
    </div>
  );
}

function ChatInterface({
  wsUrl,
  token,
  onDisconnect,
}: {
  wsUrl: string;
  token: string;
  onDisconnect: () => void;
}) {
  const { messages, status, input, setInput, sendMessage, clearConversation } =
    usePandoraChat({ url: wsUrl, token });

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      sendMessage(message.text);
    },
    [sendMessage]
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  const isStreaming = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h1 className="text-sm font-semibold">Pandora</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={clearConversation}
            disabled={isStreaming}
            title="New conversation"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquareIcon className="size-8" />}
              title="Start a conversation"
              description="Send a message to get started"
            >
              <div className="mt-4">
                <Suggestions>
                  {SUGGESTIONS.map((s) => (
                    <Suggestion
                      key={s}
                      suggestion={s}
                      onClick={handleSuggestion}
                    />
                  ))}
                </Suggestions>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((msg) => (
              <Message from={msg.role} key={msg.id}>
                <MessageContent>
                  {msg.role === "assistant" && !msg.content ? (
                    <Shimmer>Thinking...</Shimmer>
                  ) : (
                    <MessageResponse>{msg.content}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <div className="border-t p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Send a message..."
            disabled={isStreaming}
          />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
