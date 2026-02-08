# Pandora AI Agent

Personal AI assistant with multi-channel support. Bun + Turbo monorepo.

## Monorepo Structure

```
packages/
  core/       @pandora/core   — Framework library (agent, gateway, registries, types)
  pandora/    @pandora/app    — Main app: channels, subagents, tools, store backends
  web/        @pandora/web    — Reference web UI (Next.js + AI Elements)
  docs/       @pandora/docs   — Documentation site (Next.js + Nextra)
```

## Commands

```bash
bun install          # Install all workspace deps (from root)
bun run dev          # Start all packages via Turbo (persistent)
bun run build        # Build all packages
```

Per-package:
```bash
bun run --filter @pandora/app dev     # Backend only (Bun)
bun run --filter @pandora/web dev     # Web UI only (Next.js)
bun run --filter @pandora/docs dev    # Docs only (Nextra)
```

## Ports

| Service | Port |
|---------|------|
| Pandora backend (web channel) | 3000 |
| Web UI (Next.js) | 3001 |
| Docs (Nextra) | 8080 |

## Architecture

**Message flow:** Channel → Gateway → Agent → Gateway → Channel

- **Channels** receive messages from external platforms, build a `Message` object, pass to the Gateway, format and send the response back
- **Gateway** stores messages, loads history, calls the Agent, stores the response
- **Agent** runs the operator model with tools; delegates to subagents for specialized tasks

### Extension System (self-registration)

All extensions are auto-discovered via file scanning and self-register at import time:

| Extension | Location | Register with | Pattern |
|-----------|----------|--------------|---------|
| Channels | `src/channels/*/index.ts` | `defineChannel()` | Subdirectory with index.ts |
| Subagents | `src/subagents/*.ts` | `defineSubagent()` | Single file |
| Tools | `src/tools/*.ts` | `defineTool()` | Single file |
| Store backends | `src/store/*.ts` | `defineStore()` | Single file |

Files starting with `_` are skipped (helper files).

### Adding a New Channel

1. Create `packages/pandora/src/channels/<name>/index.ts`
2. Implement the `Channel` interface (`name`, `capabilities`, `start()`, `stop()`)
3. Call `defineChannel({ name, configKey, create })` at module level
4. Add config schema to `config.schema.jsonc` under `channels.properties`
5. Add config entry to `config.jsonc`

### Adding a New Tool / Subagent / Store

Same pattern — create a file, call the matching `define*()` function.

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/types.ts` | Core interfaces: Channel, Message, ChannelCapabilities, MessageHandler, StreamingMessageHandler |
| `packages/core/src/agent.ts` | Agent with `chat()` (non-streaming) and `chatStream()` (streaming) |
| `packages/core/src/gateway.ts` | Gateway with `handleMessage()`, `handleMessageStream()`, `clearConversation()` |
| `packages/core/src/registries/` | Registry modules for channels, subagents, tools, store, search-tools |
| `packages/core/src/config.ts` | Zod schema + JSONC loader |
| `packages/core/src/loader.ts` | Auto-discovery via Bun Glob |
| `packages/pandora/src/index.ts` | Entry point: loads extensions, creates core components, starts channels |
| `config.jsonc` | Runtime config (gitignored — contains secrets) |
| `config.schema.jsonc` | JSON Schema for IDE autocompletion |

## Configuration

`config.jsonc` at monorepo root (JSONC = JSON with comments). Gitignored.

- `ai.gateway.apiKey` — Vercel AI Gateway key
- `ai.agents.operator` — Required. Other agents (coder, research, webSearch) are optional.
- `ai.tools` — Tool configs (API keys, etc.)
- `channels` — Presence in config = enabled. Each channel has its own fields (e.g. Telegram: `token`, `ownerId`; Web: `token`, `port`)
- `storage` — `type` + `path` (default: sqlite)
- `logLevel` — `"normal"` or `"verbose"`

## Streaming

The `web` channel supports WebSocket streaming. The core provides:
- `Agent.chatStream()` — yields text deltas via `ToolLoopAgent.stream()` from the AI SDK
- `Gateway.handleMessageStream()` — stores messages, yields deltas, stores final response
- `Gateway.getStreamingHandler()` — returns bound streaming handler for channels

Non-streaming channels (like Telegram) use `Agent.chat()` / `Gateway.handleMessage()` — unaffected.

## Tech Stack

- **Runtime:** Bun
- **Orchestration:** Turbo
- **AI SDK:** Vercel AI SDK v6 (`ai` package) — `ToolLoopAgent`, `tool()`, `generateText`, `streamText`
- **Models:** Via Vercel AI Gateway (`@ai-sdk/gateway`)
- **Web UI:** Next.js 15, shadcn/ui, AI Elements (`ai-elements`)
- **Docs:** Nextra 4
- **Config:** JSONC + Zod validation
- **Storage:** SQLite (default), Memory (dev)

## Style

- TypeScript throughout, strict mode
- JSDoc comments on public APIs (concise, not verbose)
- Single-line doc comments for simple fields: `/** Description */`
- No semicolons preference is NOT enforced — the codebase uses semicolons
- Channels follow a consistent pattern — use the Telegram channel as reference
