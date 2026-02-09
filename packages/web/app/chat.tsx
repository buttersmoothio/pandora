"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { usePandoraChat, type PandoraMessage, type PandoraMessagePart, type SubagentThread } from "@/hooks/use-pandora-chat";
import { SubagentPanel } from "@/components/subagent-panel";
import { useConversations } from "@/hooks/use-conversations";
import type { ConnectionStatus } from "@/hooks/use-pandora-chat";
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
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "@/components/ai-elements/sources";
import { Image } from "@/components/ai-elements/image";
import {
  Suggestions,
  Suggestion,
} from "@/components/ai-elements/suggestion";
import {
  EllipsisIcon,
  MessageSquareIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  Trash2Icon,
  PanelLeftIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  if (status === "connected") return null;

  const isReconnecting = status === "reconnecting";
  const label = isReconnecting ? "Reconnecting..." : "Disconnected";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block size-2.5 rounded-full ${
              isReconnecting
                ? "animate-pulse bg-yellow-500"
                : "bg-destructive"
            }`}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const {
    conversations,
    refresh: refreshConversations,
    deleteConversation,
    loadHistory,
  } = useConversations({ baseUrl, token });

  // Debounced refresh for conversation updates from other channels
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshConversations();
    }, 500);
  }, [refreshConversations]);

  const {
    messages,
    setMessages,
    status,
    connectionStatus,
    input,
    setInput,
    sendMessage,
    clearConversation,
    sendWatch,
    threads,
  } = usePandoraChat({ url: wsUrl, token, conversationId, onConversationUpdate: debouncedRefresh });

  // Get the selected thread
  const selectedThread = selectedThreadId ? threads.get(selectedThreadId) : null;

  // Refresh conversation list when a message completes
  useEffect(() => {
    if (status === "ready" && messages.length > 0) {
      refreshConversations();
    }
  }, [status]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      sendMessage(message.text);
      setInput("");
    },
    [sendMessage, setInput]
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  const pendingConversationRef = useRef(conversationId);

  const handleNewConversation = useCallback(() => {
    const id = `web-${nanoid()}`;
    pendingConversationRef.current = id;
    setConversationId(id);
  }, []);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      pendingConversationRef.current = id;
      setConversationId(id);
      const history = await loadHistory(id);
      // Skip if user switched to a different conversation while loading
      if (pendingConversationRef.current !== id) return;
      // Set history (includes any in-progress messages from the store)
      setMessages(history);
      // Subscribe to live updates - if there's an active stream, stream-state will mark it
      sendWatch();
    },
    [loadHistory, setMessages, sendWatch]
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
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r">
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex flex-col gap-0.5 p-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={`group/item flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                    c.id === conversationId ? "bg-accent" : ""
                  }`}
                  onClick={() => handleSelectConversation(c.id)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {c.preview || "New conversation"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="ml-1 size-6 shrink-0 opacity-0 group-hover/item:opacity-100 data-[state=open]:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EllipsisIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(c.id);
                        }}
                      >
                        <Trash2Icon className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No conversations yet
                </p>
              )}
            </div>
          </div>
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
            <ConnectionIndicator status={connectionStatus} />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            <SunIcon className="size-4 rotate-0 scale-100 transition-transform dark:rotate-90 dark:scale-0" />
            <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>
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
              messages.map((msg, idx) => (
                <MessageRenderer
                  key={msg.id}
                  message={msg}
                  isLastMessage={idx === messages.length - 1}
                  isStreaming={isStreaming}
                  onToolClick={setSelectedThreadId}
                />
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

      {/* Subagent Thread Panel */}
      {selectedThread && (
        <SubagentPanel
          thread={selectedThread}
          onClose={() => setSelectedThreadId(null)}
        />
      )}
    </div>
  );
}

/** Renders a single message by iterating over its parts */
function MessageRenderer({
  message,
  isLastMessage,
  isStreaming,
  onToolClick,
}: {
  message: PandoraMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  onToolClick?: (threadId: string) => void;
}) {
  const { parts, role, channelName } = message;

  // Show channel badge for user messages from non-web channels
  const showChannelBadge = role === "user" && channelName && channelName !== "web";

  // Group parts by type for organized rendering
  const reasoningParts = parts.filter((p) => p.type === "reasoning");
  const toolParts = parts.filter((p) => p.type === "dynamic-tool");
  const sourceParts = parts.filter((p) => p.type === "source-url" || p.type === "source-document");
  const fileParts = parts.filter((p) => p.type === "file");
  const textParts = parts.filter((p) => p.type === "text");

  // Check if we have text content
  const hasText = textParts.some((p) => p.type === "text" && p.text);
  const textContent = textParts
    .filter((p): p is Extract<PandoraMessagePart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");

  // Check streaming state
  const isTextStreaming = isLastMessage && isStreaming && textParts.some(
    (p) => p.type === "text" && p.state === "streaming"
  );
  const isReasoningStreaming = isLastMessage && isStreaming && reasoningParts.some(
    (p) => p.type === "reasoning" && p.state === "streaming"
  );

  return (
    <Message from={role}>
      {/* Channel badge for messages from other channels */}
      {showChannelBadge && (
        <span className="ml-auto text-[10px] text-muted-foreground capitalize">
          via {channelName}
        </span>
      )}
      <MessageContent>
        {/* Reasoning block */}
        {reasoningParts.length > 0 && (
          <Reasoning isStreaming={isReasoningStreaming && !hasText}>
            <ReasoningTrigger />
            <ReasoningContent>
              {reasoningParts
                .filter((p): p is Extract<PandoraMessagePart, { type: "reasoning" }> => p.type === "reasoning")
                .map((p) => p.text)
                .join("")}
            </ReasoningContent>
          </Reasoning>
        )}

        {/* Tool calls */}
        {toolParts.length > 0 && (
          <ChainOfThought>
            <ChainOfThoughtHeader>
              Used {toolParts.length} tool{toolParts.length > 1 ? "s" : ""}
            </ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              {toolParts
                .filter((p): p is Extract<PandoraMessagePart, { type: "dynamic-tool" }> => p.type === "dynamic-tool")
                .map((tc) => {
                  const hasThread = !!tc.threadId;
                  const stepContent = (
                    <ChainOfThoughtStep
                      key={tc.toolCallId}
                      label={tc.toolName}
                      description={
                        tc.input
                          ? typeof tc.input === "object"
                            ? Object.entries(tc.input as Record<string, unknown>)
                                .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                                .join(", ")
                            : String(tc.input)
                          : undefined
                      }
                      status={tc.state === "output-available" ? "complete" : "active"}
                    >
                      {tc.state === "output-available" && tc.output != null && (
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">
                          {typeof tc.output === "string"
                            ? tc.output
                            : JSON.stringify(tc.output, null, 2)}
                        </pre>
                      )}
                    </ChainOfThoughtStep>
                  );

                  if (hasThread && onToolClick) {
                    return (
                      <div
                        key={tc.toolCallId}
                        className="cursor-pointer hover:bg-accent/50 rounded -mx-2 px-2 transition-colors"
                        onClick={() => onToolClick(tc.threadId!)}
                        title="Click to view subagent thread"
                      >
                        {stepContent}
                      </div>
                    );
                  }

                  return stepContent;
                })}
            </ChainOfThoughtContent>
          </ChainOfThought>
        )}

        {/* Sources */}
        {sourceParts.length > 0 && (
          <Sources>
            <SourcesTrigger count={sourceParts.length} />
            <SourcesContent>
              {sourceParts.map((part, i) => {
                if (part.type === "source-url") {
                  return (
                    <Source
                      key={part.sourceId}
                      href={part.url}
                      title={part.title || part.url}
                    />
                  );
                }
                if (part.type === "source-document") {
                  return (
                    <Source
                      key={part.sourceId}
                      title={part.title}
                    />
                  );
                }
                return null;
              })}
            </SourcesContent>
          </Sources>
        )}

        {/* Files/Images */}
        {fileParts.map((part, i) => {
          if (part.type !== "file") return null;
          // Check if it's an image
          if (part.mediaType.startsWith("image/")) {
            // Extract base64 from data URL
            const base64Match = part.url.match(/^data:[^;]+;base64,(.+)$/);
            if (base64Match) {
              return (
                <Image
                  key={i}
                  base64={base64Match[1]}
                  uint8Array={new Uint8Array()} // Not used for display
                  mediaType={part.mediaType}
                  alt={part.filename || "Generated image"}
                  className="max-w-sm rounded-lg"
                />
              );
            }
            // Regular URL
            return (
              <img
                key={i}
                src={part.url}
                alt={part.filename || "Image"}
                className="max-w-sm rounded-lg"
              />
            );
          }
          // Non-image file - show as download link
          return (
            <a
              key={i}
              href={part.url}
              download={part.filename}
              className="flex items-center gap-2 rounded bg-muted px-3 py-2 text-sm hover:bg-muted/80"
            >
              📎 {part.filename || "Download file"}
            </a>
          );
        })}

        {/* Text content */}
        {role === "assistant" && !hasText ? (
          <Shimmer>
            {toolParts.length > 0
              ? "Working..."
              : reasoningParts.length > 0
                ? "Reasoning..."
                : "Thinking..."}
          </Shimmer>
        ) : (
          textContent && <MessageResponse>{textContent}</MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
}
