/**
 * Web Channel - HTTP + WebSocket API with streaming support
 *
 * Exposes a backend API that any frontend can connect to.
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
  type ChannelCapabilities,
  type Message,
  type MessageHandler,
  type StreamingMessageHandler,
} from "@pandora/core";

type WebConfig = ChannelConfig & { token: string; port?: number };

const WEB_CAPABILITIES: ChannelCapabilities = {
  supportsImages: false,
  supportsFiles: false,
  supportsRichText: true,
  supportsButtons: false,
  supportsStreaming: true,
  maxMessageLength: -1,
};

const CONVERSATION_ID = "web-default";

type WebSocketData = { token: string };

/** Web channel: HTTP API + WebSocket streaming backed by Bun.serve(). */
export class WebChannel implements Channel {
  readonly name = "web";
  readonly capabilities = WEB_CAPABILITIES;

  private token: string;
  private port: number;
  private gateway: Gateway;
  private messageHandler: MessageHandler;
  private streamingHandler: StreamingMessageHandler;
  private server: ReturnType<typeof Bun.serve> | null = null;

  constructor(config: WebConfig, gateway: Gateway) {
    this.token = config.token;
    this.port = config.port ?? 3000;
    this.gateway = gateway;
    this.messageHandler = gateway.getHandler();
    this.streamingHandler = gateway.getStreamingHandler();
  }

  async start(): Promise<void> {
    logger.channel("web", "Starting server", { port: this.port });

    const channel = this;

    this.server = Bun.serve({
      port: this.port,

      routes: {
        "/api/message": {
          POST: async (req) => {
            const token = extractBearerToken(req);
            if (!token || token !== channel.token) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }

            const body = await req.json() as { content?: string };
            if (!body.content) {
              return Response.json({ error: "Missing content" }, { status: 400 });
            }

            const message: Message = {
              channelName: channel.name,
              userId: token,
              conversationId: CONVERSATION_ID,
              content: body.content,
            };

            try {
              const response = await channel.messageHandler(message, channel.capabilities);
              return Response.json({ response });
            } catch (error) {
              logger.error("Web", "Error processing message", error);
              return Response.json({ error: "Internal error" }, { status: 500 });
            }
          },
        },

        "/api/clear": {
          POST: async (req) => {
            const token = extractBearerToken(req);
            if (!token || token !== channel.token) {
              return Response.json({ error: "Unauthorized" }, { status: 401 });
            }

            await channel.gateway.clearConversation(CONVERSATION_ID);
            logger.channel("web", "Conversation cleared");
            return Response.json({ ok: true });
          },
        },
      },

      websocket: {
        open(ws) {
          logger.channel("web", "WebSocket connected");
        },

        async message(ws, raw) {
          const data = JSON.parse(String(raw)) as { type: string; content?: string };

          if (data.type === "clear") {
            await channel.gateway.clearConversation(CONVERSATION_ID);
            logger.channel("web", "Conversation cleared via WebSocket");
            ws.send(JSON.stringify({ type: "cleared" }));
            return;
          }

          if (data.type === "message") {
            if (!data.content) {
              ws.send(JSON.stringify({ type: "error", message: "Missing content" }));
              return;
            }

            const message: Message = {
              channelName: channel.name,
              userId: (ws.data as WebSocketData).token,
              conversationId: CONVERSATION_ID,
              content: data.content,
            };

            try {
              const stream = channel.streamingHandler(message, channel.capabilities);
              for await (const delta of stream) {
                ws.send(JSON.stringify({ type: "delta", text: delta }));
              }
              ws.send(JSON.stringify({ type: "done" }));
            } catch (error) {
              logger.error("Web", "Error streaming response", error);
              ws.send(JSON.stringify({
                type: "error",
                message: error instanceof Error ? error.message : "Internal error",
              }));
            }
            return;
          }

          ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${data.type}` }));
        },

        close(ws) {
          logger.channel("web", "WebSocket disconnected");
        },
      },

      fetch(req, server) {
        const url = new URL(req.url);

        // WebSocket upgrade at /ws
        if (url.pathname === "/ws") {
          const token = url.searchParams.get("token");
          if (!token || token !== channel.token) {
            return new Response("Unauthorized", { status: 401 });
          }

          const upgraded = server.upgrade(req, { data: { token } });
          if (upgraded) return undefined;
          return new Response("WebSocket upgrade failed", { status: 500 });
        }

        return new Response("Not found", { status: 404 });
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
