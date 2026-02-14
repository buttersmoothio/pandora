/**
 * Web Channel - HTTP + WebSocket API with streaming support
 *
 * Exposes a backend API that any frontend can connect to.
 * - GET  /api/validate — validate Bearer token
 * - GET  /api/conversations — list web conversations
 * - GET  /api/conversations/:id/history — get conversation messages
 * - DELETE /api/conversations/:id — delete a conversation
 * - POST /api/message — non-streaming request/response
 * - POST /api/clear — clear conversation history
 * - WebSocket /ws?token=... — streaming responses (token-by-token)
 */

import {
  defineChannel,
  logger,
  Gateway,
  type ChannelConfig,
  type Channel,
  type ChannelPusher,
  type ChannelCapabilities,
  type Message,
  type MessageHandler,
  type StreamEvent,
  type GatewayEvent,
} from "@pandora/core";
import type { ServerWebSocket } from "bun";

type WebConfig = ChannelConfig & { token: string; port?: number };

const WEB_CAPABILITIES: ChannelCapabilities = {
  supportsImages: false,
  supportsFiles: false,
  supportsRichText: true,
  supportsButtons: false,
  supportsStreaming: true,
  maxMessageLength: -1,
  supportsPush: true, // Can push via WebSocket if client connected
};

type WebSocketData = { token: string; unsubscribe?: () => void; unsubscribeAll?: () => void; processing?: boolean };

/** CORS headers for cross-origin requests (web UI on port 3001). */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

/** JSON response with CORS headers. */
function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders() });
}

/** Web channel: HTTP API + WebSocket streaming backed by Bun.serve(). */
export class WebChannel implements Channel, ChannelPusher {
  readonly name = "web";
  readonly capabilities = WEB_CAPABILITIES;

  private token: string;
  private port: number;
  private gateway: Gateway;
  private messageHandler: MessageHandler;
  private streamingHandlerWithEvents: (
    message: Message,
    capabilities: ChannelCapabilities,
    onEvent?: (event: StreamEvent) => void
  ) => AsyncGenerator<string, void>;
  private server: ReturnType<typeof Bun.serve> | null = null;
  /** Track connected clients by userId (token) for push notifications */
  private connectedClients = new Map<string, Set<ServerWebSocket<WebSocketData>>>();

  constructor(config: WebConfig, gateway: Gateway) {
    this.token = config.token;
    this.port = config.port ?? 3000;
    this.gateway = gateway;
    this.messageHandler = gateway.getHandler();
    this.streamingHandlerWithEvents = gateway.getStreamingHandlerWithEvents();
  }

  /** Track a client connection for push capability */
  private trackClient(ws: ServerWebSocket<WebSocketData>, userId: string): void {
    let clients = this.connectedClients.get(userId);
    if (!clients) {
      clients = new Set();
      this.connectedClients.set(userId, clients);
    }
    clients.add(ws);
  }

  /** Remove a client from tracking */
  private untrackClient(ws: ServerWebSocket<WebSocketData>, userId: string): void {
    const clients = this.connectedClients.get(userId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.connectedClients.delete(userId);
      }
    }
  }

  async start(): Promise<void> {
    logger.channel("web", "Starting server", { port: this.port });

    const channel = this;

    this.server = Bun.serve({
      port: this.port,

      routes: {
        "/api/validate": {
          GET: async (req) => {
            const token = extractBearerToken(req);
            if (!token || token !== channel.token) {
              return jsonResponse({ valid: false }, 401);
            }
            return jsonResponse({ valid: true });
          },
        },

        "/api/conversations": {
          GET: async (req) => {
            const token = extractBearerToken(req);
            if (!token || token !== channel.token) {
              return jsonResponse({ error: "Unauthorized" }, 401);
            }

            const conversations = await channel.gateway.listConversations();
            return jsonResponse({ ok: true, conversations });
          },
        },

        "/api/message": {
          POST: async (req) => {
            const token = extractBearerToken(req);
            if (!token || token !== channel.token) {
              return jsonResponse({ error: "Unauthorized" }, 401);
            }

            const body = (await req.json()) as {
              content?: string;
              conversationId?: string;
            };
            if (!body.content) {
              return jsonResponse({ error: "Missing content" }, 400);
            }

            const message: Message = {
              channelName: channel.name,
              userId: token,
              conversationId: body.conversationId ?? "web-default",
              content: body.content,
            };

            try {
              const response = await channel.messageHandler(
                message,
                channel.capabilities
              );
              return jsonResponse({ ok: true, response });
            } catch (error) {
              logger.error("Web", "Error processing message", error);
              return jsonResponse({ error: "Internal error" }, 500);
            }
          },
        },

        "/api/clear": {
          POST: async (req) => {
            const token = extractBearerToken(req);
            if (!token || token !== channel.token) {
              return jsonResponse({ error: "Unauthorized" }, 401);
            }

            const body = (await req.json()) as { conversationId?: string };
            const conversationId = body.conversationId ?? "web-default";
            await channel.gateway.clearConversation(conversationId);
            logger.channel("web", "Conversation cleared", { conversationId });
            return jsonResponse({ ok: true });
          },
        },
      },

      websocket: {
        open(ws) {
          const wsData = ws.data as WebSocketData;
          channel.trackClient(ws as ServerWebSocket<WebSocketData>, wsData.token);
          logger.channel("web", "WebSocket connected", { userId: wsData.token });
        },

        async message(ws, raw) {
          const data = JSON.parse(String(raw)) as {
            type: string;
            content?: string;
            conversationId?: string;
          };

          const conversationId = data.conversationId ?? "web-default";

          if (data.type === "clear") {
            await channel.gateway.clearConversation(conversationId);
            logger.channel("web", "Conversation cleared via WebSocket", {
              conversationId,
            });
            ws.send(JSON.stringify({ type: "cleared", conversationId }));
            return;
          }

          if (data.type === "watch") {
            const wsData = ws.data as WebSocketData;
            // Unsubscribe from any previous watch
            wsData.unsubscribe?.();

            // Send current stream state if there's an active stream (for late-joining)
            const activeState = channel.gateway.getActiveStreamState(conversationId);
            if (activeState) {
              ws.send(JSON.stringify({ type: "stream-state", ...activeState }));
            }

            // Send context state for the conversation (for UI display)
            channel.gateway.getContextState(conversationId).then((state) => {
              ws.send(JSON.stringify({ type: "context-state", conversationId, state }));
            }).catch((err) => {
              logger.warn("Web", `Failed to get context state: ${err instanceof Error ? err.message : String(err)}`);
            });

            wsData.unsubscribe = channel.gateway.subscribe(conversationId, (event: GatewayEvent) => {
              // Skip events during self-processing to avoid duplicates
              // (the message handler sends events directly for web-initiated messages)
              if ((ws.data as WebSocketData).processing) return;
              ws.send(JSON.stringify(event));
            });
            return;
          }

          if (data.type === "unwatch") {
            const wsData = ws.data as WebSocketData;
            wsData.unsubscribe?.();
            wsData.unsubscribe = undefined;
            return;
          }

          if (data.type === "watch-all") {
            const wsData = ws.data as WebSocketData;
            wsData.unsubscribeAll?.();
            wsData.unsubscribeAll = channel.gateway.subscribeAll((event: GatewayEvent) => {
              if ((ws.data as WebSocketData).processing) return;
              // Only forward lightweight events for sidebar updates
              if (event.type === "user-message" || event.type === "done") {
                ws.send(JSON.stringify({ type: "conversation-update", conversationId: event.conversationId }));
              }
            });
            return;
          }

          if (data.type === "unwatch-all") {
            const wsData = ws.data as WebSocketData;
            wsData.unsubscribeAll?.();
            wsData.unsubscribeAll = undefined;
            return;
          }

          if (data.type === "message") {
            if (!data.content) {
              ws.send(
                JSON.stringify({ type: "error", message: "Missing content", conversationId })
              );
              return;
            }

            const wsData = ws.data as WebSocketData;
            const message: Message = {
              channelName: channel.name,
              userId: wsData.token,
              conversationId,
              content: data.content,
            };

            // Mark as processing so the watch subscription skips events
            // (we send them directly below to avoid duplicates)
            wsData.processing = true;
            try {
              const onEvent = (event: StreamEvent) => {
                ws.send(JSON.stringify({ ...event, conversationId }));
              };

              const stream = channel.streamingHandlerWithEvents(
                message,
                channel.capabilities,
                onEvent
              );
              // Drive the generator to completion. Text deltas are
              // delivered via onEvent callback, not the yield loop.
              for await (const _delta of stream) {
                // Events are sent via onEvent callback
              }
              // Gateway emits "done" via pub/sub but the processing flag
              // suppresses it for this client, so send it explicitly.
              ws.send(JSON.stringify({ type: "done", conversationId }));
            } catch (error) {
              logger.error("Web", "Error streaming response", error);
              ws.send(
                JSON.stringify({
                  type: "error",
                  message:
                    error instanceof Error ? error.message : "Internal error",
                  conversationId,
                })
              );
            } finally {
              wsData.processing = false;
            }
            return;
          }

          ws.send(
            JSON.stringify({
              type: "error",
              message: `Unknown type: ${data.type}`,
              conversationId,
            })
          );
        },

        close(ws) {
          const wsData = ws.data as WebSocketData;
          wsData.unsubscribe?.();
          wsData.unsubscribeAll?.();
          channel.untrackClient(ws as ServerWebSocket<WebSocketData>, wsData.token);
          logger.channel("web", "WebSocket disconnected", { userId: wsData.token });
        },
      },

      fetch(req, server) {
        const url = new URL(req.url);

        // Handle CORS preflight
        if (req.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: corsHeaders() });
        }

        // WebSocket upgrade at /ws
        if (url.pathname === "/ws") {
          const token = url.searchParams.get("token");
          if (!token || token !== channel.token) {
            return jsonResponse({ error: "Unauthorized" }, 401);
          }

          const upgraded = server.upgrade(req, { data: { token } });
          if (upgraded) return undefined;
          return jsonResponse({ error: "WebSocket upgrade failed" }, 500);
        }

        // Dynamic routes: /api/conversations/:id/history, /api/conversations/:id/threads, /api/conversations/:id
        const historyMatch = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/history$/
        );
        if (historyMatch && req.method === "GET") {
          const token = extractBearerToken(req);
          if (!token || token !== channel.token) {
            return jsonResponse({ error: "Unauthorized" }, 401);
          }
          const id = decodeURIComponent(historyMatch[1]!);
          return channel.gateway
            .getConversationHistory(id)
            .then((messages) => jsonResponse({ ok: true, messages }));
        }

        const threadsMatch = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/threads$/
        );
        if (threadsMatch && req.method === "GET") {
          const token = extractBearerToken(req);
          if (!token || token !== channel.token) {
            return jsonResponse({ error: "Unauthorized" }, 401);
          }
          const id = decodeURIComponent(threadsMatch[1]!);
          return channel.gateway
            .getChildThreads(id)
            .then((threads) => jsonResponse({ ok: true, threads }));
        }

        const deleteMatch = url.pathname.match(
          /^\/api\/conversations\/([^/]+)$/
        );
        if (deleteMatch && req.method === "DELETE") {
          const token = extractBearerToken(req);
          if (!token || token !== channel.token) {
            return jsonResponse({ error: "Unauthorized" }, 401);
          }
          const id = decodeURIComponent(deleteMatch[1]!);
          return channel.gateway
            .deleteConversation(id)
            .then(() => jsonResponse({ ok: true }));
        }

        return jsonResponse({ error: "Not found" }, 404);
      },
    });

    logger.channel("web", "Server started", {
      url: `http://localhost:${this.port}`,
      ws: `ws://localhost:${this.port}/ws`,
    });
  }

  async stop(): Promise<void> {
    logger.channel("web", "Stopping server");
    this.server?.stop();
  }

  /**
   * Push a proactive message to a user via WebSocket.
   * Used for scheduled reminders and notifications.
   *
   * @param userId - User ID (token)
   * @param content - Message content
   */
  async push(userId: string, content: string): Promise<void> {
    const clients = this.connectedClients.get(userId);
    if (!clients || clients.size === 0) {
      logger.warn("Web", `No connected clients for push`, { userId });
      throw new Error(`User not connected: ${userId}`);
    }

    const event = JSON.stringify({
      type: "scheduled-push",
      content,
      timestamp: Date.now(),
    });

    logger.channel("web", "Pushing message", { userId, clients: clients.size });

    for (const ws of clients) {
      try {
        ws.send(event);
      } catch (error) {
        logger.warn("Web", "Failed to send to client", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

// Self-register the channel
export default defineChannel({
  name: "web",
  configKey: "web",
  create: (config, gateway) => new WebChannel(config as WebConfig, gateway),
});
