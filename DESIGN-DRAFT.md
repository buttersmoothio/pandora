# Important

This is a design draft. Nothing here is set in stone; do not treat this as gospel.

# Pandora Architecture

Your personal AI assistant that you fully control.

---

## Design Principles

1. **Mastra is a library.** It never touches the network. Pandora owns every endpoint.
2. **The web UI is the control plane.** Every thread, agent, tool, and config setting is observable and configurable from the browser.
3. **Config lives in the database.** Sensible defaults in code. The web UI is the only config interface. No config files.
4. **Secrets stay in the environment.** API keys and tokens are env vars. The web UI shows presence/absence, never values.
5. **Tools are generated from the UI.** Most users describe what they want; an LLM generates the tool; SES Compartments sandbox it. Power users drop in code or MCP servers.
6. **Deploy-anywhere.** Environment auto-detected via Hono's `getRuntimeKey()`. Same source code runs on Bun, Node.js, Vercel, Cloudflare Workers, Deno. No templates — the runtime decides.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                         PANDORA                               │
│                    (Hono, runs anywhere)                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                      API LAYER                           │ │
│  │                                                          │ │
│  │  Inbound Channels          Control Plane (Web UI)        │ │
│  │  ├─ POST /wh/telegram      ├─ GET    /api/threads        │ │
│  │  ├─ POST /wh/discord       ├─ GET    /api/threads/:id    │ │
│  │  └─ POST /wh/slack         ├─ POST   /api/threads/:id    │ │
│  │                             ├─ GET    /api/config         │ │
│  │  Chat (AI SDK streaming)   ├─ PUT    /api/config         │ │
│  │  └─ POST /api/chat          ├─ GET    /api/agents         │ │
│  │                             ├─ GET    /api/tools          │ │
│  │  Cron                       ├─ POST   /api/tools          │ │
│  │  └─ POST /api/cron/:taskId  ├─ GET    /api/schedule       │ │
│  │                             ├─ GET    /api/env-status     │ │
│  │  Polling (server mode)      └─ GET    /api/logs           │ │
│  │  └─ (long-running)                                        │ │
│  └──────────────────────────┬──────────────────────────────┘ │
│                              │                                │
│  ┌───────────────────────────▼──────────────────────────────┐ │
│  │                   MASTRA (in-process library)             │ │
│  │                                                           │ │
│  │  Security Processors → Operator Agent → Specialists       │ │
│  │                         (.stream / .network)              │ │
│  │                                                           │ │
│  │  4-Tier Memory   Tools (3-tier trust)   Model Router      │ │
│  │                  Provider / Gateway      AI SDK compat    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                │
│  ┌───────────────────────────▼──────────────────────────────┐ │
│  │                  TOOL SANDBOX (SES)                        │ │
│  │  ┌─────────────┐ ┌───────────────────┐ ┌──────────────┐  │ │
│  │  │ Tier 1      │ │ Tier 2            │ │ Tier 3       │  │ │
│  │  │ Built-in    │ │ LLM-Generated     │ │ MCP External │  │ │
│  │  │ (host)      │ │ (SES Compartment) │ │ (process)    │  │ │
│  │  └─────────────┘ └───────────────────┘ └──────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                │
│  ┌───────────────────────────▼──────────────────────────────┐ │
│  │              REMOTE DATABASE (Turso / PostgreSQL)          │ │
│  │  messages │ threads │ config │ tools │ schedule │ vectors │ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Environment Detection

Pandora auto-detects its deployment environment using Hono's built-in adapter helpers. No templates, no manual configuration.

```typescript
// src/env.ts
import { getRuntimeKey } from "hono/adapter";
import { env as honoEnv } from "hono/adapter";
import type { Context as HonoContext } from "hono";

export type Runtime = "workerd" | "edge-light" | "bun" | "node" | "deno" | "fastly" | "other";

interface Environment {
  runtime: Runtime;
  serverless: boolean;
}

const SERVERLESS_RUNTIMES = new Set<Runtime>(["workerd", "edge-light", "fastly"]);

export function detectEnvironment(): Environment {
  const runtime = getRuntimeKey() as Runtime;
  return {
    runtime,
    serverless: SERVERLESS_RUNTIMES.has(runtime),
  };
}

// Unified env access — works across Cloudflare bindings, Vercel, Bun, Node, Deno
export function getEnv<T extends Record<string, string>>(c: HonoContext): T {
  return honoEnv<T>(c);
}
```

From `serverless`, everything cascades automatically:

| Concern | `serverless: true` | `serverless: false` |
|---|---|---|
| Channel mode | Webhook only | Polling preferred, webhook available |
| Scheduler | Platform cron → `POST /api/cron/:taskId` | In-process (`setInterval` / `node-cron`) |
| Storage | Remote required (Turso / PG) | Local file OK (`file:pandora.db`) |
| Mastra init | Per-request (stateless) | Cached in-process, invalidate on config change |

The web UI's environment page shows what was detected and flags misconfigurations: *"You're running on Vercel but DATABASE_URL points to a local file — this won't persist between invocations."*

### Hono's `env()` for Cross-Platform Access

All environment variable access goes through Hono's `env(c)` helper, which unifies:
- `process.env` on Node.js / Bun
- Cloudflare Workers bindings (from `wrangler.toml` / `wrangler.jsonc`)
- `Deno.env` on Deno
- Vercel environment variables

This means Cloudflare Workers support is real — no `process.env` assumptions anywhere.

---

## Entry Point

```typescript
// src/index.ts
import "ses";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "hono/adapter";
import { detectEnvironment } from "./env";
import { createMastra } from "./mastra";
import { getConfig } from "./config";
import { createStorage } from "./storage";
import { threadRoutes } from "./routes/threads";
import { chatRoute } from "./routes/chat";
import { configRoutes } from "./routes/config";
import { agentRoutes } from "./routes/agents";
import { toolRoutes } from "./routes/tools";
import { scheduleRoutes } from "./routes/schedule";
import { envStatusRoute } from "./routes/env-status";
import { TelegramChannel } from "./channels/telegram";
import { startPollingChannels } from "./channels/polling";
import { startLocalScheduler } from "./schedule/local";
import { handleCronTask } from "./schedule/endpoint";
import { authMiddleware } from "./security/middleware";

// Lock down all JS intrinsics once at startup — enables SES Compartments
lockdown({ errorTaming: "unsafe", overrideTaming: "moderate" });

const app = new Hono();
const { runtime, serverless } = detectEnvironment();

// Lazy-initialized singletons (serverless recreates per-request, server caches)
let _storage: MastraStorage | null = null;
function getStorage(c: HonoContext) {
  if (!_storage) _storage = createStorage(env(c));
  return _storage;
}

let _mastra: Mastra | null = null;
async function getMastra(c: HonoContext) {
  const storage = getStorage(c);
  if (serverless || !_mastra) {
    const config = await getConfig(storage);
    _mastra = await createMastra(config, storage, env(c));
  }
  return _mastra;
}

// --- Channel webhooks (validated by platform-specific tokens) ---
app.post("/wh/telegram", async (c) => {
  const mastra = await getMastra(c);
  const config = await getConfig(getStorage(c));
  return TelegramChannel.handleWebhook(c, mastra, config);
});

// --- Cron endpoint (Vercel Cron, CF Cron Triggers, or system cron) ---
app.post("/api/cron/:taskId", authMiddleware, async (c) => {
  return handleCronTask(c, await getMastra(c), getStorage(c));
});

// --- Authenticated control plane + web chat ---
app.use("/api/*", cors({ origin: (origin) => origin }));
app.use("/api/*", authMiddleware);

app.route("/api/threads", threadRoutes(getMastra, getStorage));
app.post("/api/chat", chatRoute(getMastra));
app.route("/api/config", configRoutes(getStorage));
app.route("/api/agents", agentRoutes(getMastra, getStorage));
app.route("/api/tools", toolRoutes(getMastra, getStorage));
app.route("/api/schedule", scheduleRoutes(getStorage));
app.get("/api/env-status", envStatusRoute);

export default app;
```

Server mode startup (polling channels + local scheduler) is handled by the entry point:

```typescript
// serve.ts (self-hosted only)
import app from "./src/index";

const server = Bun.serve({ fetch: app.fetch, port: process.env.PORT ?? 3000 });

// Start polling channels + local scheduler after server is listening
const storage = createStorage(process.env);
const config = await getConfig(storage);
const mastra = await createMastra(config, storage, process.env);
await startPollingChannels(mastra, config);
await startLocalScheduler(mastra, storage, config);
```

---

## Config System

### No Config File

Defaults live in code. The database stores user overrides. The web UI is the only config interface.

```typescript
// src/config.ts
import { z } from "zod";

const ConfigSchema = z.object({
  identity: z.string(),
  personality: z.string(),
  models: z.object({
    primary: z.string(),
    fast: z.string(),
    coding: z.string(),
    security: z.string(),
  }),
  memory: z.object({
    lastMessages: z.number(),
    semanticRecall: z.object({ topK: z.number() }),
    workingMemory: z.boolean(),
    observationalMemory: z.boolean(),
  }),
  agents: z.record(z.object({
    enabled: z.boolean(),
    description: z.string(),
    instructions: z.string().optional(),
    model: z.string().nullable(),
  })),
  channels: z.record(z.object({
    enabled: z.boolean(),
    mode: z.enum(["polling", "webhook", "auto"]).default("auto"),
  })),
  tools: z.object({
    webSearch: z.object({ enabled: z.boolean(), provider: z.string() }),
    codeExec: z.object({ enabled: z.boolean(), requireApproval: z.boolean() }),
  }),
  schedule: z.object({
    tasks: z.array(z.object({
      id: z.string(),
      cron: z.string(),
      prompt: z.string(),
      enabled: z.boolean(),
    })),
  }),
  security: z.object({
    promptInjection: z.object({ enabled: z.boolean(), threshold: z.number() }),
    piiRedaction: z.object({ enabled: z.boolean() }),
    moderation: z.object({ enabled: z.boolean() }),
    systemPromptScrubbing: z.object({ enabled: z.boolean() }),
  }),
});

export type PandoraConfig = z.infer<typeof ConfigSchema>;

const DEFAULTS: PandoraConfig = {
  identity: "You are Pandora, a helpful personal AI assistant.",
  personality: "Direct, knowledgeable, and respectful of the user's time.",
  models: {
    primary: "anthropic/claude-sonnet-4-20250514",
    fast: "openai/gpt-4.1-nano",
    coding: "anthropic/claude-sonnet-4-20250514",
    security: "openai/gpt-4.1-nano",
  },
  memory: {
    lastMessages: 20,
    semanticRecall: { topK: 5 },
    workingMemory: true,
    observationalMemory: false,
  },
  agents: {
    researcher: { enabled: true, description: "Researches topics and answers knowledge questions", model: null },
    coder: { enabled: true, description: "Writes, reviews, and debugs code", model: null },
    webSearch: { enabled: true, description: "Searches the web for current information", model: "fast" },
  },
  channels: {
    telegram: { enabled: true, mode: "auto" },
    discord: { enabled: false, mode: "auto" },
    web: { enabled: true, mode: "webhook" },
  },
  tools: {
    webSearch: { enabled: true, provider: "tavily" },
    codeExec: { enabled: true, requireApproval: true },
  },
  schedule: { tasks: [] },
  security: {
    promptInjection: { enabled: true, threshold: 0.8 },
    piiRedaction: { enabled: true },
    moderation: { enabled: true },
    systemPromptScrubbing: { enabled: true },
  },
};

export async function getConfig(storage: MastraStorage): Promise<PandoraConfig> {
  const row = await storage.get("pandora_config", "current");
  if (!row) return DEFAULTS;
  return ConfigSchema.parse({ ...DEFAULTS, ...row.value });
}

export async function updateConfig(
  storage: MastraStorage,
  patch: Partial<PandoraConfig>,
): Promise<PandoraConfig> {
  const current = await getConfig(storage);
  const updated = ConfigSchema.parse({ ...current, ...patch });
  await storage.set("pandora_config", "current", updated);
  return updated;
}
```

### Environment Variables

Secrets never touch the database. Access unified via Hono's `env()` across all platforms.

```typescript
// src/routes/env-status.ts
import { env } from "hono/adapter";
import { getRuntimeKey } from "hono/adapter";

const KNOWN_VARS = {
  ANTHROPIC_API_KEY: "Anthropic (Claude)",
  OPENAI_API_KEY: "OpenAI (GPT)",
  GOOGLE_API_KEY: "Google (Gemini)",
  OPENROUTER_API_KEY: "OpenRouter (Gateway)",
  TELEGRAM_BOT_TOKEN: "Telegram",
  DISCORD_TOKEN: "Discord",
  TAVILY_API_KEY: "Tavily (Web Search)",
  DATABASE_URL: "Database",
  DATABASE_AUTH_TOKEN: "Database Auth Token",
};

export function envStatusRoute(c: HonoContext) {
  const e = env<Record<string, string>>(c);
  const runtime = getRuntimeKey();
  const serverless = ["workerd", "edge-light", "fastly"].includes(runtime);

  const vars = Object.fromEntries(
    Object.entries(KNOWN_VARS).map(([key, label]) => [
      key,
      { label, set: !!e[key] },
    ]),
  );

  const warnings: string[] = [];
  if (serverless && e.DATABASE_URL?.startsWith("file:"))
    warnings.push("DATABASE_URL points to a local file but you're running serverless — data won't persist.");
  if (!e.DATABASE_URL && serverless)
    warnings.push("No DATABASE_URL set. Serverless requires a remote database (Turso or PostgreSQL).");

  return c.json({ runtime, serverless, vars, warnings });
}
```

---

## Multi-Provider / Gateway Support

Mastra supports 50+ LLM providers via the `"provider/model"` string syntax. Pandora exposes this fully.

```
anthropic/claude-sonnet-4-20250514     # Direct Anthropic API
openai/gpt-4.1-nano                    # Direct OpenAI API
google/gemini-2.5-flash                # Direct Google API
openrouter/anthropic/claude-sonnet-4   # Via OpenRouter gateway
ollama/llama3.2                        # Local model via Ollama
```

Users can:
- Route through OpenRouter for unified billing
- Use local models via Ollama for privacy
- Mix providers: Claude for reasoning, GPT for fast tasks
- Point at custom OpenAI-compatible endpoints (vLLM, Together, etc.)

The web UI model picker shows available providers based on which API keys are configured. No key for Anthropic? Provider grayed out with "configure ANTHROPIC_API_KEY to enable."

---

## Mastra Instance

```typescript
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { Memory } from "@mastra/memory";
import { createOperator, createSpecialists } from "../agents";
import { loadBuiltinTools } from "../tools/builtin";
import { loadGeneratedTools } from "../tools/generated";

export async function createMastra(
  config: PandoraConfig,
  storage: MastraStorage,
  envVars: Record<string, string>,
) {
  const memory = new Memory({
    storage,
    vector: createVector(envVars),
    options: {
      lastMessages: config.memory.lastMessages,
      semanticRecall: config.memory.semanticRecall.topK > 0
        ? { topK: config.memory.semanticRecall.topK, messageRange: { before: 2, after: 1 } }
        : false,
      workingMemory: config.memory.workingMemory ? { enabled: true } : false,
    },
  });

  const builtinTools = loadBuiltinTools(config, envVars);
  const generatedTools = await loadGeneratedTools(storage, envVars);
  const allTools = { ...builtinTools, ...generatedTools };

  const specialists = createSpecialists(config, memory);
  const operator = createOperator(config, memory, allTools, specialists);

  return new Mastra({ agents: { operator, ...specialists } });
}
```

---

## Channel System: Dual Mode (Polling + Webhook)

Each channel declares which modes it supports. The resolved mode depends on channel capabilities and runtime.

### Channel Adapter Interface

```typescript
// src/channels/base.ts
interface ChannelAdapter {
  name: string;
  supportsPolling: boolean;
  supportsWebhook: boolean;

  // Server mode: long-running, no public URL needed
  startPolling?(mastra: Mastra, config: PandoraConfig): Promise<void>;
  stopPolling?(): Promise<void>;

  // Serverless mode: stateless webhook handler
  handleWebhook?(c: HonoContext, mastra: Mastra, config: PandoraConfig): Promise<Response>;
}
```

### Mode Resolution

```typescript
// src/channels/resolve.ts
function resolveChannelMode(
  channel: ChannelAdapter,
  channelConfig: { mode: "polling" | "webhook" | "auto" },
  serverless: boolean,
): "polling" | "webhook" | "disabled" {
  if (channelConfig.mode === "webhook" && channel.supportsWebhook) return "webhook";
  if (channelConfig.mode === "polling" && channel.supportsPolling) return "polling";

  // Auto: polling on server (simpler), webhook on serverless (only option)
  if (channelConfig.mode === "auto") {
    if (serverless) return channel.supportsWebhook ? "webhook" : "disabled";
    return channel.supportsPolling ? "polling" : "webhook";
  }

  return "disabled";
}
```

### Telegram: Both Modes

```typescript
// src/channels/telegram.ts
import { Bot, webhookCallback } from "grammy";

export const TelegramChannel: ChannelAdapter = {
  name: "telegram",
  supportsPolling: true,
  supportsWebhook: true,

  async startPolling(mastra, config) {
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
    bot.on("message:text", (ctx) => handleMessage(ctx, mastra));
    await bot.start();
  },

  async handleWebhook(c, mastra, config) {
    const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
    bot.on("message:text", (ctx) => handleMessage(ctx, mastra));
    return webhookCallback(bot, "hono")(c);
  },
};

async function handleMessage(ctx: GrammyContext, mastra: Mastra) {
  const agent = mastra.getAgent("operator");
  try {
    await ctx.replyWithChatAction("typing");
    const result = await agent.stream(ctx.message!.text!, {
      threadId: `telegram-${ctx.chat.id}`,
      resourceId: `user-${ctx.from!.id}`,
    });

    let response = "";
    for await (const chunk of result.textStream) {
      response += chunk;
    }

    for (const part of splitMessage(response, 4096)) {
      await ctx.reply(part, { parse_mode: "Markdown" });
    }
  } catch (error) {
    await ctx.reply("Something went wrong. Please try again.");
  }
}
```

### Polling Startup (Server Mode Only)

```typescript
// src/channels/polling.ts
export async function startPollingChannels(mastra: Mastra, config: PandoraConfig) {
  const channels = [TelegramChannel, DiscordChannel];

  for (const channel of channels) {
    const channelConfig = config.channels[channel.name];
    if (!channelConfig?.enabled) continue;

    const mode = resolveChannelMode(channel, channelConfig, false);
    if (mode === "polling" && channel.startPolling) {
      console.log(`[${channel.name}] Starting in polling mode`);
      await channel.startPolling(mastra, config);
    }
  }
}
```

### Channel Modes

| Channel | Polling | Webhook | Notes |
|---|---|---|---|
| Telegram | ✅ grammY `bot.start()` | ✅ grammY `webhookCallback()` | Polling = no ngrok needed |
| Discord | ✅ discord.js gateway | ✅ Interactions endpoint | Gateway needs persistent process |
| Slack | ❌ | ✅ Events API | Webhook-only by design |
| Web | — | ✅ POST /api/chat | Always HTTP request |

---

## Streaming: AI SDK Compatible

The web chat endpoint returns Vercel AI SDK–compatible streaming responses, enabling `useChat()` from `ai/react` out of the box.

```typescript
// src/routes/chat.ts
export function chatRoute(getMastra: (c: HonoContext) => Promise<Mastra>) {
  return async (c: HonoContext) => {
    const { messages, threadId } = await c.req.json();
    const mastra = await getMastra(c);
    const agent = mastra.getAgent("operator");

    const result = await agent.stream(messages, {
      threadId: threadId ?? `web-${crypto.randomUUID()}`,
      resourceId: c.get("userId"),
    });

    // AI SDK Data Stream — works with useChat() on the frontend
    return result.toDataStreamResponse();
  };
}
```

```tsx
// web/app/chat.tsx
import { useChat } from "ai/react";

export function Chat({ threadId }: { threadId?: string }) {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: "/api/chat",
    body: { threadId },
  });

  return (
    <div>
      {messages.map((m) => <div key={m.id}>{m.role}: {m.content}</div>)}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
```

Mastra streams structured `UIMessage` objects (with tool call states, annotations) rather than raw text. The `useChat()` hook handles parsing, optimistic updates, and error states.

---

## Scheduling

### Pluggable: Server vs. Serverless

```typescript
// src/schedule/types.ts
interface ScheduledTask {
  id: string;
  cron: string;           // "*/30 * * * *"
  prompt: string;         // What to tell the agent
  threadId?: string;      // Optional: continue a specific thread
  enabled: boolean;
}

interface Scheduler {
  register(task: ScheduledTask): Promise<void>;
  remove(taskId: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

### Server Mode: In-Process

```typescript
// src/schedule/local.ts
import cron from "node-cron";

export class LocalScheduler implements Scheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  constructor(private mastra: Mastra, private storage: MastraStorage) {}

  async register(task: ScheduledTask) {
    if (this.jobs.has(task.id)) this.jobs.get(task.id)!.stop();
    const job = cron.schedule(task.cron, async () => {
      const agent = this.mastra.getAgent("operator");
      await agent.generate(task.prompt, {
        threadId: task.threadId ?? `schedule-${task.id}`,
        resourceId: "system",
      });
    });
    this.jobs.set(task.id, job);
  }

  async start() {
    const config = await getConfig(this.storage);
    for (const task of config.schedule.tasks) {
      if (task.enabled) await this.register(task);
    }
  }

  async remove(taskId: string) { this.jobs.get(taskId)?.stop(); this.jobs.delete(taskId); }
  async stop() { for (const j of this.jobs.values()) j.stop(); this.jobs.clear(); }
}
```

### Serverless Mode: Cron Endpoint

Platform cron (Vercel, CF) hits `POST /api/cron/:taskId`. Tasks stored in DB config.

```typescript
// src/schedule/endpoint.ts
export async function handleCronTask(c: HonoContext, mastra: Mastra, storage: MastraStorage) {
  const taskId = c.req.param("taskId");
  const config = await getConfig(storage);
  const task = config.schedule.tasks.find((t) => t.id === taskId);
  if (!task?.enabled) return c.json({ skipped: true });

  const agent = mastra.getAgent("operator");
  await agent.generate(task.prompt, {
    threadId: task.threadId ?? `schedule-${task.id}`,
    resourceId: "system",
  });
  return c.json({ ok: true, taskId });
}
```

---

## Agent System

### Operator

```typescript
// src/agents/operator.ts
export function createOperator(
  config: PandoraConfig,
  memory: Memory,
  tools: Record<string, any>,
  specialists: Record<string, Agent>,
) {
  return new Agent({
    id: "operator",
    description: "Routes user requests to specialist agents or handles them directly.",
    instructions: [config.identity, config.personality].join("\n\n"),
    model: config.models.primary,
    memory,
    tools,
    agents: specialists,
    inputProcessors: buildInputProcessors(config),
    outputProcessors: buildOutputProcessors(config),
  });
}

function buildInputProcessors(config: PandoraConfig) {
  const m = config.models.security;
  const p = [];
  p.push(new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true }));
  if (config.security.promptInjection.enabled)
    p.push(new PromptInjectionDetector({ model: m, strategy: "block", threshold: config.security.promptInjection.threshold }));
  if (config.security.piiRedaction.enabled)
    p.push(new PIIDetector({ model: m, strategy: "redact" }));
  if (config.security.moderation.enabled)
    p.push(new ModerationProcessor({ model: m, strategy: "block" }));
  return p;
}

function buildOutputProcessors(config: PandoraConfig) {
  const m = config.models.security;
  const p = [];
  if (config.security.systemPromptScrubbing.enabled)
    p.push(new SystemPromptScrubber({ model: m, strategy: "redact" }));
  if (config.security.piiRedaction.enabled)
    p.push(new PIIDetector({ model: m, strategy: "redact" }));
  p.push(new TokenLimiterProcessor({ limit: 4000, strategy: "truncate" }));
  return p;
}
```

### Specialists

```typescript
// src/agents/specialists.ts
export function createSpecialists(config: PandoraConfig, memory: Memory) {
  const agents: Record<string, Agent> = {};
  for (const [id, agentConfig] of Object.entries(config.agents)) {
    if (!agentConfig.enabled) continue;
    agents[id] = new Agent({
      id,
      description: agentConfig.description,
      instructions: agentConfig.instructions ?? `You are the ${id} specialist.`,
      model: resolveModel(agentConfig.model, config),
      memory,
    });
  }
  return agents;
}

function resolveModel(ref: string | null, config: PandoraConfig): string {
  if (!ref) return config.models.primary;
  if (ref in config.models) return config.models[ref as keyof typeof config.models];
  return ref;  // Direct: "openrouter/anthropic/claude-sonnet-4"
}
```

---

## Tool System: Three-Tier Trust Model

The agent sees all tools identically. The sandbox is invisible at the orchestration layer.

```
Agent calls tool "weather-lookup"
  → Tier 1 (built-in): runs in host process
  → Tier 2 (generated): runs inside SES Compartment with scoped capabilities
  → Tier 3 (MCP): routes to external process
  → Result returned identically in all cases
```

### Tier 1 — Built-in Tools (Host Process)

```typescript
// src/tools/builtin.ts
export function loadBuiltinTools(config: PandoraConfig, envVars: Record<string, string>) {
  const tools: Record<string, any> = {};

  if (config.tools.webSearch.enabled) {
    tools.webSearch = createTool({
      id: "web-search",
      description: "Search the web for current information",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        maxResults: z.number().optional().default(5),
      }),
      execute: async ({ context }) => {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: envVars.TAVILY_API_KEY,
            query: context.query,
            max_results: context.maxResults,
          }),
        });
        return response.json();
      },
    });
  }

  return tools;
}
```

### Tier 2 — LLM-Generated Tools (SES Compartment)

Generated from the web UI. Stored in DB. Executed in zero-authority SES Compartments.

#### What Gets Stored

```typescript
interface GeneratedToolRecord {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, any>;   // JSON Schema
  code: string;                        // LLM-generated function body
  permissions: ToolPermissions;
  enabled: boolean;
  createdAt: string;
}

interface ToolPermissions {
  network?: { allow: string[] };       // Allowed hostnames
  env?: { allow: string[] };           // Allowed env var names
  fs?: { allow: string[] };            // Allowed directory paths
}
```

#### Sandboxed Execution

```typescript
// src/tools/generated.ts
export async function loadGeneratedTools(storage: MastraStorage, envVars: Record<string, string>) {
  const records = await storage.list("generated_tools");
  const tools: Record<string, any> = {};
  for (const record of records) {
    if (!record.enabled) continue;
    tools[record.id] = createSandboxedTool(record, envVars);
  }
  return tools;
}

function createSandboxedTool(record: GeneratedToolRecord, envVars: Record<string, string>) {
  return createTool({
    id: record.id,
    description: record.description,
    inputSchema: jsonSchemaToZod(record.inputSchema),

    execute: async ({ context }) => {
      const endowments = buildEndowments(record.permissions, envVars);
      const compartment = new Compartment({
        globals: harden({
          ...endowments,
          input: harden(context),
          console: tamedConsole,
        }),
        __options__: true,
      });

      const fn = compartment.evaluate(`(${record.code})`);
      return fn(context);
    },
  });
}
```

#### Capability Factories

```typescript
// src/tools/sandbox/endowments.ts
export function buildEndowments(permissions: ToolPermissions, envVars: Record<string, string>) {
  const endowments: Record<string, any> = {};

  if (permissions.network?.allow?.length) {
    const allowed = new Set(permissions.network.allow);
    endowments.fetch = harden(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url);
      if (!allowed.has(parsed.hostname)) throw new Error(`Network denied: ${parsed.hostname}`);
      if (isInternalIP(parsed.hostname)) throw new Error(`SSRF blocked: ${parsed.hostname}`);
      return fetch(url, init);
    });
  }

  if (permissions.env?.allow?.length) {
    const snapshot: Record<string, string> = {};
    for (const key of permissions.env.allow) {
      if (envVars[key]) snapshot[key] = envVars[key];
    }
    endowments.env = harden({ get: (key: string) => snapshot[key] });
  }

  if (permissions.fs?.allow?.length) {
    const roots = permissions.fs.allow.map((p) => path.resolve(p));
    endowments.readFile = harden(async (filePath: string) => {
      const resolved = path.resolve(filePath);
      if (!roots.some((root) => resolved.startsWith(root)))
        throw new Error(`Filesystem denied: ${filePath}`);
      return Bun.file(resolved).text();
    });
  }

  return endowments;
}
```

#### Example Generated Tool

```javascript
// Stored in DB — sees scoped globals only
async function(input) {
  const response = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${env.get("WEATHER_API_KEY")}&q=${encodeURIComponent(input.city)}`,
  );
  const data = await response.json();
  return { temperature: data.current.temp_c, conditions: data.current.condition.text };
}
```

#### Why SES

- **`lockdown()`** — freezes all JS intrinsics at startup. Prototype pollution impossible.
- **`harden(obj)`** — transitively freezes capability objects.
- **`new Compartment(endowments)`** — zero-authority context. Nothing exists unless endowed.

Production-proven: MetaMask (30M+ users), Agoric, Salesforce. Pure JS — no native deps, works everywhere.

### Tier 3 — MCP External Tools

```typescript
import { MCPClient } from "@mastra/mcp";
const mcpTools = await new MCPClient({ servers: config.mcpServers }).getTools();
```

Treated as untrusted: description validation, user approval for new servers, all communication logged.

### Tool Generation Flow

1. User describes tool in natural language
2. Coding agent generates: function + input schema + permission declaration
3. Web UI shows review: "This tool requests: network `api.weatherapi.com`, env `WEATHER_API_KEY`"
4. User approves → stored in DB → active on next request

---

## Web UI: The Control Plane

### Thread View (Unified Inbox)

All channels write to the same DB with prefixed thread IDs.

```
telegram-{chatId} | discord-{channelId} | web-{uuid} | schedule-{taskId}
```

```typescript
// src/routes/threads.ts
export function threadRoutes(getMastra, getStorage) {
  const app = new Hono();

  app.get("/", async (c) => {
    const memory = new Memory({ storage: getStorage(c) });
    return c.json(await memory.getThreadsByResourceId({ resourceId: c.get("userId") }));
  });

  app.get("/:threadId/messages", async (c) => {
    const memory = new Memory({ storage: getStorage(c) });
    return c.json(await memory.getMessages({ threadId: c.req.param("threadId") }));
  });

  // Send into ANY thread — agent gets full thread context
  app.post("/:threadId/send", async (c) => {
    const { message } = await c.req.json();
    const agent = (await getMastra(c)).getAgent("operator");
    const result = await agent.stream(message, {
      threadId: c.req.param("threadId"),
      resourceId: c.get("userId"),
    });
    return result.toDataStreamResponse();
  });

  return app;
}
```

### Web UI Views

| View | Content |
|---|---|
| **Threads** | Unified inbox across all channels. Channel badge. Click to read/continue. |
| **Chat** | New conversations. AI SDK `useChat()` streaming. |
| **Agents** | Operator + specialists. Enable/disable, model/provider, instructions. Live. |
| **Tools** | Built-in toggles. Generated: code, permissions, create/edit/delete. MCP servers. |
| **Schedule** | Tasks with cron expressions, enable/disable, last run. Serverless guidance. |
| **Config** | Identity, personality, models, memory, security. Changes apply next request. |
| **Environment** | Detected runtime, serverless flag, env var status, warnings, setup guidance. |

---

## Memory Architecture

Mastra's 4-tier system. All channels share one database.

| Tier | Purpose | Security |
|---|---|---|
| **Message History** | Last N messages per thread | ACID, no filesystem exposure |
| **Working Memory** | Persistent user prefs/context | Schema-validated, no injection |
| **Semantic Recall** | Vector search across conversations | Scoped by resource/thread |
| **Observational Memory** | Background compression | 60-80% context reduction |

Working memory is per-resource — preferences from Telegram available in web chat.

---

## Storage

```typescript
// src/storage.ts
export function createStorage(envVars: Record<string, string>) {
  const url = envVars.DATABASE_URL;
  if (url?.startsWith("postgres")) return new PgStore({ connectionString: url });
  return new LibSQLStore({ url: url ?? "file:pandora.db", authToken: envVars.DATABASE_AUTH_TOKEN });
}

export function createVector(envVars: Record<string, string>) {
  const url = envVars.DATABASE_URL;
  if (url?.startsWith("postgres")) return new PgVector({ connectionString: url });
  return new LibSQLVector({ url: url ?? "file:pandora.db", authToken: envVars.DATABASE_AUTH_TOKEN });
}
```

---

## Security Model

| Layer | OpenClaw Failure | Pandora's Defense |
|---|---|---|
| Network | 0.0.0.0 binding, WebSocket RCE | Hono HTTP, explicit routes only |
| Auth | No auth, guest escalation | Middleware on all `/api/*` |
| Credentials | Cleartext in files | Env vars via Hono `env()`, never in DB |
| Input | No injection defense | PromptInjectionDetector (configurable) |
| Output | System prompt leakage | SystemPromptScrubber |
| Memory | Writable MEMORY.md | Schema-validated working memory in DB |
| Tools (built-in) | PATH injection | Audited code, env via Hono adapter |
| Tools (generated) | 20% malicious skills | SES Compartments, capability declarations |
| Tools (MCP) | No sandboxing | Process separation, description validation |
| Config | Mutable safety controls | Sandbox enforced by `lockdown()`, not config |

Three principles:
1. **Zero ambient authority.** Generated tools start with nothing.
2. **Immutable safety controls.** Enforced by runtime, not API-mutable config.
3. **Allowlist-only.** Capabilities granted, never blocked from a full set.

---

## Testing

Vitest across all layers. `MockLanguageModelV3` for agents, `app.request()` for routes, capability assertion for SES. No real LLM calls, no real Telegram API, no network.

### Configuration

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    pool: "forks",  // Each fork gets its own lockdown()
    coverage: { provider: "istanbul" },  // v8 needs node:inspector (unavailable in Bun)
  },
});
```

```typescript
// test/setup.ts
import "ses";

// lockdown() is irreversible and process-global — called once per fork
lockdown({
  errorTaming: "unsafe",       // Preserve Vitest stack traces
  overrideTaming: "moderate",  // Compatibility with npm packages
  consoleTaming: "unsafe",     // Keep console for test debugging
  stackFiltering: "verbose",
});
```

Separate configs for unit vs e2e:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --config vitest.config.ts",
    "test:e2e": "vitest --config vitest.e2e.config.ts"
  }
}
```

```typescript
// vitest.e2e.config.ts
export default defineConfig({
  test: {
    include: ["**/*.e2e.test.ts"],
    fileParallelism: false,  // Prevents DB race conditions
    setupFiles: ["./test/setup.ts", "./test/e2e-setup.ts"],
  },
});
```

### Test Helpers

Shared factories used across all test layers:

```typescript
// test/helpers.ts
import { Agent } from "@mastra/core/agent";
import { MockLanguageModelV3 } from "ai/test";
import { simulateReadableStream } from "ai";
import { Bot } from "grammy";
import app from "../src/index";
import { createStorage } from "../src/storage";
import type { PandoraEnv } from "../src/env";

// --- Mock environment ---
export const TEST_ENV: PandoraEnv = {
  DATABASE_URL: "file::memory:",
  ANTHROPIC_API_KEY: "test-key",
  TELEGRAM_BOT_TOKEN: "test-token",
  TAVILY_API_KEY: "test-tavily",
};

// --- Mock LLM that returns a fixed response ---
export function mockModel(response: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text: response }],
      finishReason: { unified: "stop", raw: undefined },
      usage: { inputTokens: { total: 10, noCache: 10 }, outputTokens: { total: 15, text: 15 } },
      warnings: [],
    }),
  });
}

// --- Mock LLM that streams chunks ---
export function mockStreamModel(chunks: string[]) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t-1" },
          ...chunks.map((delta) => ({ type: "text-delta" as const, id: "t-1", delta })),
          { type: "text-end", id: "t-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage: { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 10, text: 10 } },
          },
        ],
      }),
    }),
  });
}

// --- Authenticated request helper for Hono ---
export function apiRequest(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token", ...init?.headers },
  }, TEST_ENV);
}

// --- grammY test bot with outgoing call interception ---
export function createTestBot() {
  const bot = new Bot("test-token");
  bot.botInfo = {
    id: 12345, is_bot: true, first_name: "Pandora",
    username: "pandora_bot", can_join_groups: true,
    can_read_all_group_messages: false, supports_inline_queries: false,
  };

  const outgoing: Array<{ method: string; payload: any }> = [];
  bot.api.config.use(async (_prev, method, payload) => {
    outgoing.push({ method, payload });
    return { ok: true, result: true } as any;
  });

  return { bot, outgoing };
}

// --- Telegram update factory ---
export function telegramTextUpdate(text: string, chatId = 123, userId = 123) {
  return {
    update_id: Math.floor(Math.random() * 100000),
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "private" as const, first_name: "Test" },
      from: { id: userId, is_bot: false, first_name: "Test" },
      text,
      ...(text.startsWith("/") ? { entities: [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0].length }] } : {}),
    },
  };
}
```

### Unit Tests

#### Agents

`MockLanguageModelV3` from `ai/test` plugs directly into Mastra agents — same interface as real providers.

```typescript
// test/unit/agents.test.ts
import { describe, it, expect } from "vitest";
import { Agent } from "@mastra/core/agent";
import { mockModel, mockStreamModel } from "../helpers";

describe("Operator agent", () => {
  const agent = new Agent({
    id: "operator",
    instructions: "You are Pandora, a helpful assistant.",
    model: mockModel("The weather in Stockholm is 12°C."),
  });

  it("generates a text response", async () => {
    const result = await agent.generate("What's the weather?");
    expect(result.text).toBe("The weather in Stockholm is 12°C.");
  });

  it("streams text chunks", async () => {
    const streamAgent = new Agent({
      id: "operator",
      instructions: "You are Pandora.",
      model: mockStreamModel(["Hello", ", ", "world!"]),
    });

    const result = await streamAgent.stream("Hi");
    let text = "";
    for await (const chunk of result.textStream) text += chunk;
    expect(text).toBe("Hello, world!");
  });
});
```

#### Tools

```typescript
// test/unit/tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { loadBuiltinTools } from "../../src/tools/builtin";
import { TEST_ENV } from "../helpers";

describe("Built-in tools", () => {
  it("web search calls Tavily with correct params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({ results: [{ title: "Result 1" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const config = { tools: { webSearch: { enabled: true, provider: "tavily" }, codeExec: { enabled: false, requireApproval: true } } };
    const tools = loadBuiltinTools(config as any, TEST_ENV);
    await tools.webSearch.execute({ context: { query: "TypeScript tips", maxResults: 3 } });

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.query).toBe("TypeScript tips");
    expect(body.api_key).toBe("test-tavily");

    vi.unstubAllGlobals();
  });

  it("disabled tools are not loaded", () => {
    const config = { tools: { webSearch: { enabled: false, provider: "tavily" }, codeExec: { enabled: false, requireApproval: true } } };
    const tools = loadBuiltinTools(config as any, TEST_ENV);
    expect(tools).toEqual({});
  });
});
```

#### SES Sandbox

```typescript
// test/unit/sandbox.test.ts
import { describe, it, expect } from "vitest";

describe("SES lockdown", () => {
  it("freezes Array.prototype", () => {
    expect(Object.isFrozen(Array.prototype)).toBe(true);
  });

  it("prevents prototype pollution", () => {
    expect(() => { (Object.prototype as any).polluted = true; }).toThrow();
  });
});

describe("Compartment isolation", () => {
  it("has no access to host globals", () => {
    const c = new Compartment({ __options__: true });
    expect(c.evaluate("typeof process")).toBe("undefined");
    expect(c.evaluate("typeof fetch")).toBe("undefined");
    expect(c.evaluate("typeof require")).toBe("undefined");
  });

  it("isolates globalThis between compartments", () => {
    const c1 = new Compartment({ __options__: true });
    const c2 = new Compartment({ __options__: true });
    c1.evaluate('globalThis.leaked = 42');
    expect(c2.evaluate("typeof leaked")).toBe("undefined");
    expect((globalThis as any).leaked).toBeUndefined();
  });

  it("blocks Date.now() and Math.random()", () => {
    const c = new Compartment({ __options__: true });
    expect(() => c.evaluate("Date.now()")).toThrow();
    expect(() => c.evaluate("Math.random()")).toThrow();
  });
});

describe("Capability endowments", () => {
  it("scoped fetch allows declared domains only", async () => {
    const calls: string[] = [];
    const realFetch = async (url: string) => { calls.push(url); return new Response("ok"); };

    const scopedFetch = harden(async (url: string, init?: RequestInit) => {
      const { hostname } = new URL(url);
      if (!["api.weather.com"].includes(hostname)) throw new Error(`Network denied: ${hostname}`);
      return realFetch(url);
    });

    const c = new Compartment({ globals: harden({ fetch: scopedFetch }), __options__: true });

    // Allowed
    await c.evaluate('fetch("https://api.weather.com/v1/current")');
    expect(calls).toHaveLength(1);

    // Blocked
    await expect(c.evaluate('fetch("https://evil.com/steal")')).rejects.toThrow("Network denied");
  });

  it("scoped env exposes declared keys only", () => {
    const scopedEnv = harden({ get: (k: string) => ({ WEATHER_KEY: "abc123" }[k]) });
    const c = new Compartment({ globals: harden({ env: scopedEnv }), __options__: true });

    expect(c.evaluate('env.get("WEATHER_KEY")')).toBe("abc123");
    expect(c.evaluate('env.get("DATABASE_URL")')).toBeUndefined();
  });

  it("hardened endowments cannot be modified", () => {
    const scopedEnv = harden({ get: (k: string) => "value" });
    const c = new Compartment({ globals: harden({ env: scopedEnv }), __options__: true });
    expect(() => c.evaluate('env.get = () => "hacked"')).toThrow();
  });
});
```

#### Config

```typescript
// test/unit/config.test.ts
import { describe, it, expect } from "vitest";
import { getConfig, updateConfig, ConfigSchema } from "../../src/config";

describe("Config system", () => {
  it("returns defaults when DB is empty", async () => {
    const storage = new InMemoryStorage();
    const config = await getConfig(storage);
    expect(config.models.primary).toBe("anthropic/claude-sonnet-4-20250514");
    expect(ConfigSchema.safeParse(config).success).toBe(true);
  });

  it("merges partial patch with defaults", async () => {
    const storage = new InMemoryStorage();
    const updated = await updateConfig(storage, { personality: "Sarcastic but helpful." });
    expect(updated.personality).toBe("Sarcastic but helpful.");
    expect(updated.models.primary).toBe("anthropic/claude-sonnet-4-20250514"); // Unchanged
  });

  it("rejects invalid config", async () => {
    const storage = new InMemoryStorage();
    await expect(updateConfig(storage, { models: { primary: 123 } } as any)).rejects.toThrow();
  });
});
```

#### Runtime Detection

```typescript
// test/unit/runtime.test.ts
import { describe, it, expect, vi } from "vitest";

describe("Runtime detection", () => {
  it("detects serverless for workerd", async () => {
    vi.doMock("hono/adapter", () => ({ getRuntimeKey: () => "workerd" }));
    const { getRuntime } = await import("../../src/runtime");
    expect(getRuntime().serverless).toBe(true);
    vi.doUnmock("hono/adapter");
  });

  it("detects server mode for bun", async () => {
    vi.doMock("hono/adapter", () => ({ getRuntimeKey: () => "bun" }));
    const { getRuntime } = await import("../../src/runtime");
    expect(getRuntime().serverless).toBe(false);
    vi.doUnmock("hono/adapter");
  });
});
```

### Integration Tests

#### Hono API Routes

`app.request()` exercises the full middleware → route → response chain with no HTTP server:

```typescript
// test/integration/api.test.ts
import { describe, it, expect } from "vitest";
import { apiRequest, TEST_ENV } from "../helpers";

describe("Config API", () => {
  it("GET /api/config returns defaults", async () => {
    const res = await apiRequest("/api/config");
    expect(res.status).toBe(200);
    const config = await res.json();
    expect(config.models.primary).toBeDefined();
  });

  it("PUT /api/config patches and persists", async () => {
    const res = await apiRequest("/api/config", {
      method: "PUT",
      body: JSON.stringify({ personality: "Witty and concise." }),
    });
    expect(res.status).toBe(200);

    const get = await apiRequest("/api/config");
    const config = await get.json();
    expect(config.personality).toBe("Witty and concise.");
  });
});

describe("Environment status", () => {
  it("reports set/missing env vars", async () => {
    const res = await apiRequest("/api/env-status");
    const status = await res.json();
    expect(status.ANTHROPIC_API_KEY.set).toBe(true);
    expect(status.DISCORD_TOKEN.set).toBe(false);
  });
});

describe("Runtime info", () => {
  it("returns detected runtime", async () => {
    const res = await apiRequest("/api/runtime");
    const info = await res.json();
    expect(info).toHaveProperty("key");
    expect(info).toHaveProperty("serverless");
  });
});

describe("Auth middleware", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await app.request("/api/config", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
```

#### Streaming Chat

```typescript
// test/integration/streaming.test.ts
import { describe, it, expect } from "vitest";
import { apiRequest } from "../helpers";

describe("Chat streaming", () => {
  it("POST /api/threads/:id/send returns AI SDK data stream", async () => {
    const res = await apiRequest("/api/threads/test-thread-1/send", {
      method: "POST",
      body: JSON.stringify({ message: "Hello Pandora" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain"); // AI SDK data stream
    expect(res.body).toBeInstanceOf(ReadableStream);

    // Consume full stream
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });
});
```

#### Tool Generation Pipeline

```typescript
// test/integration/tool-generation.test.ts
import { describe, it, expect } from "vitest";
import { apiRequest } from "../helpers";

describe("Tool CRUD", () => {
  const toolRecord = {
    id: "weather-lookup",
    name: "Weather Lookup",
    description: "Check weather for a city",
    inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    code: 'async function(input) { return { temp: 20, city: input.city }; }',
    permissions: { network: { allow: [] }, env: { allow: [] } },
    enabled: true,
  };

  it("creates, lists, and deletes a generated tool", async () => {
    // Create
    const create = await apiRequest("/api/tools", {
      method: "POST",
      body: JSON.stringify(toolRecord),
    });
    expect(create.status).toBe(200);

    // List
    const list = await apiRequest("/api/tools");
    const tools = await list.json();
    expect(tools.generated.some((t: any) => t.id === "weather-lookup")).toBe(true);

    // Delete
    const del = await apiRequest("/api/tools/weather-lookup", { method: "DELETE" });
    expect(del.status).toBe(200);
  });
});

describe("Sandboxed tool execution", () => {
  it("executes generated tool inside SES Compartment", async () => {
    const { createSandboxedTool } = await import("../../src/tools/generated");

    const tool = createSandboxedTool({
      id: "test-tool",
      name: "Test",
      description: "Returns input doubled",
      inputSchema: { type: "object", properties: { n: { type: "number" } } },
      code: "async function(input) { return { result: input.n * 2 }; }",
      permissions: {},
      enabled: true,
    }, TEST_ENV);

    const result = await tool.execute({ context: { n: 21 } });
    expect(result).toEqual({ result: 42 });
  });

  it("blocks undeclared network access", async () => {
    const { createSandboxedTool } = await import("../../src/tools/generated");

    const tool = createSandboxedTool({
      id: "evil-tool",
      name: "Evil",
      description: "Tries to call undeclared host",
      inputSchema: { type: "object", properties: {} },
      code: 'async function(input) { return await fetch("https://evil.com"); }',
      permissions: { network: { allow: ["api.weather.com"] } },
      enabled: true,
    }, TEST_ENV);

    await expect(tool.execute({ context: {} })).rejects.toThrow("Network denied");
  });
});
```

#### Telegram Channel Adapter

```typescript
// test/integration/telegram.test.ts
import { describe, it, expect } from "vitest";
import { createTestBot, telegramTextUpdate } from "../helpers";

describe("Telegram adapter", () => {
  it("echoes response via sendMessage", async () => {
    const { bot, outgoing } = createTestBot();
    bot.on("message:text", (ctx) => ctx.reply("Pandora says hi"));

    await bot.handleUpdate(telegramTextUpdate("hello"));

    expect(outgoing).toHaveLength(1);
    expect(outgoing[0].method).toBe("sendMessage");
    expect(outgoing[0].payload.text).toBe("Pandora says hi");
  });

  it("webhook route processes Telegram update", async () => {
    const res = await app.request("/wh/telegram", {
      method: "POST",
      body: JSON.stringify(telegramTextUpdate("Test message")),
      headers: { "Content-Type": "application/json" },
    }, TEST_ENV);

    // Webhook should accept (200) even if we can't verify the bot's reply in this path
    expect(res.status).toBe(200);
  });
});
```

#### Scheduling

```typescript
// test/integration/scheduler.test.ts
import { describe, it, expect } from "vitest";
import { apiRequest } from "../helpers";

describe("Scheduler", () => {
  it("creates and lists scheduled tasks", async () => {
    const task = {
      id: "daily-summary",
      name: "Daily Summary",
      cron: "0 9 * * *",
      prompt: "Summarize my pending items.",
      enabled: true,
    };

    await apiRequest("/api/schedule", { method: "POST", body: JSON.stringify(task) });

    const res = await apiRequest("/api/schedule");
    const tasks = await res.json();
    expect(tasks.some((t: any) => t.id === "daily-summary")).toBe(true);
  });

  it("cron endpoint executes task", async () => {
    const res = await apiRequest("/api/cron/daily-summary", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("cron endpoint skips disabled task", async () => {
    // Disable the task
    await apiRequest("/api/schedule", {
      method: "POST",
      body: JSON.stringify({ id: "disabled-task", name: "Disabled", cron: "* * * * *", prompt: "test", enabled: false }),
    });

    const res = await apiRequest("/api/cron/disabled-task", { method: "POST" });
    const body = await res.json();
    expect(body.skipped).toBe(true);
  });
});
```

### End-to-End Tests

Cross-channel tests verify Pandora's core promise: a conversation started on Telegram can be continued from the web UI with full context.

```typescript
// test/e2e/cross-channel.e2e.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { apiRequest, TEST_ENV } from "../helpers";

describe("Cross-channel continuity", () => {
  beforeEach(async () => {
    // Truncate all tables between tests
    const storage = createStorage(TEST_ENV);
    await storage.clear();
  });

  it("Telegram message creates thread, web UI continues it", async () => {
    // 1. Simulate Telegram webhook
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 456, type: "private", first_name: "Madusha" },
        from: { id: 456, is_bot: false, first_name: "Madusha" },
        text: "Help me with TypeScript generics",
      },
    };

    await app.request("/wh/telegram", {
      method: "POST",
      body: JSON.stringify(update),
      headers: { "Content-Type": "application/json" },
    }, TEST_ENV);

    // 2. Verify thread exists via API
    const threadsRes = await apiRequest("/api/threads");
    const threads = await threadsRes.json();
    const telegramThread = threads.find((t: any) => t.threadId === "telegram-456");
    expect(telegramThread).toBeDefined();

    // 3. Read messages from Telegram thread
    const msgsRes = await apiRequest("/api/threads/telegram-456/messages");
    const messages = await msgsRes.json();
    expect(messages.length).toBeGreaterThanOrEqual(2); // user + assistant

    // 4. Continue from web UI into the SAME thread
    const webRes = await apiRequest("/api/threads/telegram-456/send", {
      method: "POST",
      body: JSON.stringify({ message: "Can you give me an example?" }),
    });
    expect(webRes.status).toBe(200);

    // 5. Verify unified history
    const updatedMsgsRes = await apiRequest("/api/threads/telegram-456/messages");
    const updatedMessages = await updatedMsgsRes.json();
    expect(updatedMessages.length).toBeGreaterThanOrEqual(4); // 2 original + 2 new
  });

  it("Web thread is not visible as Telegram thread", async () => {
    // Create a web-only thread
    const res = await apiRequest("/api/threads/new", {
      method: "POST",
      body: JSON.stringify({ message: "New web conversation" }),
    });
    expect(res.status).toBe(200);

    // Verify thread prefix
    const threadsRes = await apiRequest("/api/threads");
    const threads = await threadsRes.json();
    const webThreads = threads.filter((t: any) => t.threadId.startsWith("web-"));
    expect(webThreads.length).toBeGreaterThanOrEqual(1);
  });
});
```

### Evals

Mastra's `@mastra/evals` provides scorers for output quality — the layer that catches semantic regressions no mock can detect. Use deterministic scorers in CI, LLM-judged scorers for nightly quality gates.

```typescript
// test/evals/operator.eval.ts
import { describe, it, expect } from "vitest";
import { runEvals } from "@mastra/core/evals";
import { KeywordCoverageScorer, ContentSimilarityScorer } from "@mastra/evals";
import { createOperator } from "../../src/agents/operator";

describe("Operator agent evals", () => {
  it("responds to greetings appropriately", async () => {
    const result = await runEvals({
      data: [
        { input: "Hello!", groundTruth: { keywords: ["hello", "hi", "help"] } },
        { input: "What can you do?", groundTruth: { keywords: ["assist", "help", "tasks"] } },
      ],
      target: operatorAgent,
      scorers: [new KeywordCoverageScorer()],
    });

    for (const score of result.scores) {
      expect(score.value).toBeGreaterThan(0.5);
    }
  });
});
```

### Test Pyramid

| Layer | What | Tool | Speed |
|---|---|---|---|
| **Unit** | Agents, tools, config, sandbox, runtime detection | `MockLanguageModelV3`, `vi.fn()`, Compartment assertions | ms |
| **Integration** | API routes, streaming, auth, tool CRUD, scheduler | `app.request()`, in-memory storage | ~1s |
| **E2E** | Cross-channel threads, memory persistence, full pipeline | Real DB (truncated), webhook simulation | ~5s |
| **Evals** | Output quality, routing accuracy, personality adherence | `@mastra/evals` scorers, `runEvals()` | Varies |

Run unit + integration on every commit. Run e2e before deploy. Run evals nightly or on prompt/personality changes.

---

## Deployment

| Target | Runtime Key | Serverless | Channels | Scheduler | Storage |
|---|---|---|---|---|---|
| Local dev | `bun` / `node` | ❌ | Polling | `node-cron` | `file:pandora.db` |
| VPS (Docker) | `bun` / `node` | ❌ | Polling | `node-cron` | PostgreSQL |
| Vercel | `edge-light` | ✅ | Webhook | Vercel Cron | Turso |
| Cloudflare | `workerd` | ✅ | Webhook | CF Cron Triggers | Turso / D1 |
| Fly.io | `bun` / `node` | ❌ | Polling | `node-cron` | Fly Postgres |
| Deno Deploy | `deno` | ✅ | Webhook | Deno.cron | Turso |

Same source code. Different entry point. Environment auto-detected.

---

## Existing Feature Parity with V1

| Feature | V1 | V2 (Mastra) |
|---|---|---|
| **Channels** | Custom | Dual mode adapters (polling + webhook) |
| **Streaming** | Custom SSE | AI SDK UIMessage via Mastra `.toDataStreamResponse()` |
| **Subagents** | Custom routing | Mastra Agent Networks (`.network()`) |
| **Tools** | Custom | Mastra `createTool()` + SES sandbox + MCP |
| **Memory** | Custom | Mastra 4-tier (messages, working, semantic, observational) |
| **Storage** | Custom | Mastra storage (LibSQL, PostgreSQL, pluggable) |
| **Scheduling** | Custom | Pluggable: in-process (server) + cron endpoint (serverless) |

---

## File Structure

```
pandora/
├── src/
│   ├── index.ts                    # Hono app, routes, lockdown()      (~70 lines)
│   ├── config.ts                   # Defaults + DB config              (~90 lines)
│   ├── env.ts                      # Hono adapter detection            (~20 lines)
│   ├── storage.ts                  # Storage/vector factory            (~20 lines)
│   ├── mastra/
│   │   └── index.ts                # Mastra instance factory           (~40 lines)
│   ├── agents/
│   │   ├── operator.ts             # Operator + processors             (~80 lines)
│   │   └── specialists.ts          # Specialist factories              (~30 lines)
│   ├── channels/
│   │   ├── base.ts                 # Adapter interface                 (~20 lines)
│   │   ├── telegram.ts             # Polling + webhook                 (~80 lines)
│   │   ├── polling.ts              # Server-mode startup               (~30 lines)
│   │   └── resolve.ts              # Mode resolution                   (~20 lines)
│   ├── routes/
│   │   ├── threads.ts              # Thread CRUD + send                (~50 lines)
│   │   ├── chat.ts                 # AI SDK streaming                  (~15 lines)
│   │   ├── config.ts               # Config read/write                 (~15 lines)
│   │   ├── agents.ts               # Agent management                  (~30 lines)
│   │   ├── tools.ts                # Tool CRUD + generation            (~60 lines)
│   │   ├── schedule.ts             # Schedule management               (~40 lines)
│   │   └── env-status.ts           # Runtime + env status              (~30 lines)
│   ├── schedule/
│   │   ├── types.ts                # Scheduler interface               (~15 lines)
│   │   ├── local.ts                # In-process node-cron              (~40 lines)
│   │   └── endpoint.ts             # Cron endpoint handler             (~15 lines)
│   ├── tools/
│   │   ├── builtin.ts              # Built-in definitions              (~50 lines)
│   │   ├── generated.ts            # DB → sandboxed tools              (~40 lines)
│   │   ├── types.ts                # Records + permissions             (~20 lines)
│   │   └── sandbox/
│   │       ├── endowments.ts       # Capability factories              (~60 lines)
│   │       └── schema.ts           # JSON Schema → Zod                 (~40 lines)
│   └── security/
│       └── middleware.ts            # Auth                             (~40 lines)
├── web/                             # Web UI (separate package)
├── test/
│   ├── setup.ts                     # SES lockdown for test forks
│   ├── e2e-setup.ts                 # DB teardown for e2e
│   ├── helpers.ts                   # Mock factories, test env
│   ├── unit/                        # Agents, tools, sandbox, config, runtime
│   ├── integration/                 # API routes, streaming, Telegram, scheduler
│   ├── e2e/                         # Cross-channel thread continuity
│   └── evals/                       # @mastra/evals quality scorers
├── vitest.config.ts
├── vitest.e2e.config.ts
├── serve.ts                         # Self-hosted entry                (~10 lines)
├── api/index.ts                     # Vercel entry                     (~3 lines)
├── worker.ts                        # CF Workers entry                 (~3 lines)
├── vercel.json
├── wrangler.toml
├── Dockerfile
└── package.json
```

**Pandora core: ~1,100 lines.** Tests: ~600 lines. Web UI is a separate package.

---

## What Mastra Provides vs. What Pandora Builds

| Concern | Mastra | Pandora |
|---|---|---|
| Agent orchestration | ✅ `.stream()`, `.generate()`, `.network()` | Config wiring |
| Multi-agent routing | ✅ Agent Networks | Agent definitions from DB |
| 4-tier memory | ✅ `@mastra/memory` | — |
| Storage backends | ✅ LibSQL, PostgreSQL | Factory using Hono `env()` |
| 50+ LLM providers | ✅ Provider string syntax | Model picker in web UI |
| AI SDK streaming | ✅ `.toDataStreamResponse()` | Chat endpoint |
| Security processors | ✅ 6 built-in | Config toggles |
| Tool framework | ✅ `createTool()` + Zod | — |
| MCP support | ✅ `@mastra/mcp` | MCP config in web UI |
| HTTP server | — | ✅ Hono |
| Channel adapters | — | ✅ Dual mode (polling + webhook) |
| Environment detection | — | ✅ Hono `getRuntimeKey()` |
| Config system | — | ✅ Defaults + DB |
| Control plane API | — | ✅ CRUD routes |
| Web UI | — | ✅ Separate package |
| Tool sandbox | — | ✅ SES Compartments |
| Tool generation | — | ✅ LLM → review → DB → sandbox |
| Scheduling | — | ✅ Pluggable: local + endpoint |
| Auth | — | ✅ Middleware |

---

## Technology Stack

| Layer | Technology | Package |
|---|---|---|
| Runtime | Bun / Node.js 22+ / Deno / CF Workers | — |
| Server | Hono | `hono` |
| Agent framework | Mastra (library mode) | `@mastra/core` |
| Memory | Mastra Memory | `@mastra/memory` |
| Storage | LibSQL → PostgreSQL | `@mastra/libsql` / `@mastra/pg` |
| Telegram | grammY | `grammy` |
| Tool sandbox | SES | `ses` |
| Scheduling | node-cron (server) / platform cron | `node-cron` |
| Validation | Zod | `zod` |
| Streaming | Vercel AI SDK | `ai` |
| Testing | Vitest + AI SDK mocks | `vitest`, `ai/test`, `@mastra/evals` |