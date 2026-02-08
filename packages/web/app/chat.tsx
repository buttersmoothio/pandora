"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { usePandoraChat } from "@/hooks/use-pandora-chat";
import { useConversations } from "@/hooks/use-conversations";
import type { ChatMessage } from "@/hooks/use-pandora-chat";
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
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  MessageSquareIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  Trash2Icon,
  PanelLeftIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_PANDORA_WS_URL ?? "ws://localhost:3000/ws";
const ENV_TOKEN = process.env.NEXT_PUBLIC_PANDORA_TOKEN ?? "";

const SUGGESTIONS = [
  "What can you help me with?",
  "Tell me a fun fact",
  "Explain quantum computing simply",
  "Write a short poem",
];

/** Convert ws://host:port/ws → http://host:port */
function wsUrlToHttp(wsUrl: string): string {
  return wsUrl
    .replace(/^ws:/, "http:")
    .replace(/^wss:/, "https:")
    .replace(/\/ws\/?$/, "");
}

/** Read URL search params (client-side only). */
function getUrlParams(): { token?: string; backend?: string } {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("token") ?? undefined,
    backend: params.get("backend") ?? undefined,
  };
}

export default function Chat() {
  const [token, setToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS_URL);
  const [tokenInput, setTokenInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Read URL params on mount
  useEffect(() => {
    const params = getUrlParams();
    if (params.backend) setWsUrl(params.backend);
    const effectiveWs = params.backend ?? DEFAULT_WS_URL;

    if (params.token) {
      // Validate token from URL
      validateToken(params.token, effectiveWs).then((valid) => {
        if (valid) {
          setToken(params.token!);
        }
        setInitialized(true);
      });
    } else if (ENV_TOKEN) {
      setToken(ENV_TOKEN);
      setInitialized(true);
    } else {
      setInitialized(true);
    }
  }, []);

  async function validateToken(t: string, ws: string): Promise<boolean> {
    try {
      const base = wsUrlToHttp(ws);
      const res = await fetch(`${base}/api/validate`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = (await res.json()) as { valid: boolean };
      return data.valid === true;
    } catch {
      return false;
    }
  }

  async function handleTokenSubmit(t: string) {
    setValidating(true);
    setTokenError("");
    const valid = await validateToken(t, wsUrl);
    setValidating(false);
    if (valid) {
      setToken(t);
      // Persist token in URL
      const url = new URL(window.location.href);
      url.searchParams.set("token", t);
      if (wsUrl !== DEFAULT_WS_URL) url.searchParams.set("backend", wsUrl);
      window.history.replaceState({}, "", url.toString());
    } else {
      setTokenError("Invalid token. Please try again.");
    }
  }

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <Shimmer>Connecting...</Shimmer>
      </div>
    );
  }

  if (!token) {
    return (
      <TokenPrompt
        value={tokenInput}
        onChange={setTokenInput}
        onSubmit={handleTokenSubmit}
        validating={validating}
        error={tokenError}
      />
    );
  }

  return <ChatInterface wsUrl={wsUrl} token={token} onDisconnect={() => setToken(null)} />;
}

function TokenPrompt({
  value,
  onChange,
  onSubmit,
  validating,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (token: string) => void;
  validating: boolean;
  error: string;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Pandora</h1>
          <p className="text-sm text-muted-foreground">
            Enter your auth token to connect
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() && !validating) onSubmit(value.trim());
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
            disabled={validating}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!value.trim() || validating}>
            {validating ? "Validating..." : "Connect"}
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
  const baseUrl = useMemo(() => wsUrlToHttp(wsUrl), [wsUrl]);
  const [conversationId, setConversationId] = useState(() => `web-${nanoid()}`);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const {
    messages,
    setMessages,
    status,
    input,
    setInput,
    sendMessage,
    clearConversation,
  } = usePandoraChat({ url: wsUrl, token, conversationId });

  const {
    conversations,
    refresh: refreshConversations,
    deleteConversation,
    loadHistory,
  } = useConversations({ baseUrl, token });

  // Refresh conversation list when a message completes
  useEffect(() => {
    if (status === "ready" && messages.length > 0) {
      refreshConversations();
    }
  }, [status]);

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

  const handleNewConversation = useCallback(() => {
    setConversationId(`web-${nanoid()}`);
  }, []);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      setConversationId(id);
      const history = await loadHistory(id);
      setMessages(history);
    },
    [loadHistory, setMessages]
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (id === conversationId) {
        handleNewConversation();
      }
    },
    [deleteConversation, conversationId, handleNewConversation]
  );

  const { resolvedTheme, setTheme } = useTheme();
  const isStreaming = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="flex w-64 shrink-0 flex-col border-r">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Conversations</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleNewConversation}
              title="New conversation"
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-0.5 p-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group/item flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                    c.id === conversationId ? "bg-accent" : ""
                  }`}
                  onClick={() => handleSelectConversation(c.id)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {c.preview || "New conversation"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 opacity-0 group-hover/item:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteConversation(c.id);
                    }}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No conversations yet
                </p>
              )}
            </div>
          </ScrollArea>
        </aside>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title="Toggle sidebar"
            >
              <PanelLeftIcon className="size-4" />
            </Button>
            <h1 className="text-sm font-semibold">Pandora</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              title="Toggle theme"
            >
              <SunIcon className="size-4 rotate-0 scale-100 transition-transform dark:rotate-90 dark:scale-0" />
              <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clearConversation}
              disabled={isStreaming}
              title="Clear conversation"
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
                    {/* Tool calls */}
                    {msg.toolCalls?.map((tc) => (
                      <Tool key={tc.toolCallId}>
                        <ToolHeader
                          type="dynamic-tool"
                          state={tc.state}
                          toolName={tc.toolName}
                        />
                        <ToolContent>
                          <ToolInput input={tc.args} />
                          {tc.state === "output-available" && (
                            <ToolOutput
                              output={tc.result}
                              errorText={undefined}
                            />
                          )}
                        </ToolContent>
                      </Tool>
                    ))}
                    {/* Message text */}
                    {msg.role === "assistant" && !msg.content ? (
                      <Shimmer>
                        {msg.toolCalls?.length ? "Working..." : "Thinking..."}
                      </Shimmer>
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
    </div>
  );
}
