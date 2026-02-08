# Pandora AI Agent

Personal AI assistant with multi-channel support. Bun + Turbo monorepo.

## Structure

```
packages/
  core/       @pandora/core   — Framework: agent, gateway, registries, types
  pandora/    @pandora/app    — App: channels, subagents, tools, stores
  web/        @pandora/web    — Web UI: Next.js + shadcn/ui + AI Elements
  docs/       @pandora/docs   — Docs: Nextra
```

## Commands

```bash
bun install                            # Install all deps
bun run dev                            # Start everything (Turbo)
bun run --filter @pandora/app dev      # Backend only (port 3000)
bun run --filter @pandora/web dev      # Web UI only (port 3001)
bun run --filter @pandora/docs dev     # Docs only (port 8080)
```

## Where Things Live

### Core (`packages/core/src/`)
- `types.ts` — Message, ChatMessage, Channel, ChannelCapabilities, StreamEvent
- `agent.ts` — Agent with `chat()` and `chatStream(history, capabilities, onEvent?)`
- `gateway.ts` — Routes messages between channels, store, and agent
- `registries/` — Extension registries (channels, subagents, tools, store, search-tools)
- `config.ts` — Zod schema + JSONC loader
- `loader.ts` — Auto-discovery via Bun Glob

### App (`packages/pandora/src/`)
- `index.ts` — Entry point: loads extensions, wires up components, starts channels
- `channels/telegram/` — Telegram channel (reference for non-streaming channels)
- `channels/web/` — Web channel: HTTP API + WebSocket streaming + REST endpoints
- `subagents/` — Specialized sub-agents (one file each, self-register via `defineSubagent()`)
- `tools/` — Tool implementations (one file each, self-register via `defineTool()`)
- `store/sqlite.ts` — SQLite store (default, WAL mode, `bun:sqlite`)
- `store/memory.ts` — In-memory store (dev/testing)

### Web UI (`packages/web/`)
- `app/chat.tsx` — Main chat component (token validation, sidebar, tool rendering)
- `hooks/use-pandora-chat.ts` — WebSocket hook (streaming, tool call events, conversation scoping)
- `hooks/use-conversations.ts` — REST hook for conversation CRUD
- `components/ai-elements/` — AI Elements components (install via `bunx ai-elements@latest add <name>`)
- `components/ui/` — shadcn/ui components (install via `bunx shadcn@latest add <name>`)

### Config
- `config.jsonc` — Runtime config at monorepo root (gitignored, contains secrets)
- `config.schema.jsonc` — JSON Schema for IDE autocompletion
- `config.example.jsonc` — Template for new setups

## Extension System

Extensions self-register at import time. Auto-discovered by file scanning in `packages/pandora/src/`.

| Type | Location | Register with |
|------|----------|---------------|
| Channel | `channels/*/index.ts` | `defineChannel()` |
| Subagent | `subagents/*.ts` | `defineSubagent()` |
| Tool | `tools/*.ts` | `defineTool()` |
| Store | `store/*.ts` | `defineStore()` |

Files starting with `_` are skipped. To add a new extension: create the file, call the matching `define*()`, add config schema if needed.

## Message Flow

Channel → Gateway → Agent → Gateway → Channel

- **Streaming** (web): `chatStream()` yields text deltas + `onEvent` callback for tool-call/tool-result events
- **Non-streaming** (telegram): `chat()` returns complete response

## Web Channel Protocol

Backend serves HTTP REST + WebSocket on port 3000:
- `GET /api/validate` — token validation
- `GET /api/conversations` — list conversations
- `GET /api/conversations/:id/history` — conversation messages
- `DELETE /api/conversations/:id` — delete conversation
- `WS /ws?token=...` — streaming chat (messages include `conversationId`)

WebSocket message types: `message`, `clear`, `delta`, `done`, `tool-call`, `tool-result`, `error`

## Tech Stack

- **Runtime:** Bun
- **AI SDK:** Vercel AI SDK v6 (`ai`) — `ToolLoopAgent`, `tool()`, `streamText`
- **Models:** Vercel AI Gateway (`@ai-sdk/gateway`)
- **Web UI:** Next.js 15, shadcn/ui, AI Elements
- **Storage:** SQLite (default) or Memory

## Style

- TypeScript strict mode, semicolons
- JSDoc on public APIs (concise). `/** One-liner */` for simple fields
- Use Telegram channel as reference pattern for new channels
