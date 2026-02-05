# Architecture

High-level design and data flow. For types, method signatures, and parameters see JSDoc in the source (e.g. `src/core/types.ts`, `gateway.ts`, `agent.ts`, `store/types.ts`).

## Overview

- **Channels** — Inbound/outbound messaging (Telegram). Turn platform events into `Message`, call gateway handler, send reply.
- **Gateway** — Receives messages, stores them, loads history, calls agent, stores and returns response.
- **Store** — Conversation history (SQLite or in-memory).
- **Agent** — Operator + optional subagents (coder, research). Operator handles chat and delegates via tools.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Channel    │────▶│   Gateway   │────▶│   Store     │
│  (Telegram) │     │             │     │ (SQLite /   │
│             │◀────│             │◀────│  memory)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Agent     │
                    │ (operator + │
                    │  subagents) │
                    └─────────────┘
```

## Data flow

1. Channel receives user message → builds `Message` → calls gateway handler with capabilities.
2. Gateway: store user message → load history → agent.chat(history, capabilities) → store reply → return text.
3. Channel sends reply (formatting, chunking as needed).

## Operator and subagents

- **Operator** — Main model; instructions include channel capabilities and available tools. Decides when to call tools.
- **Subagents** — Optional coder/research; exposed as tools. When operator calls a tool, subagent runs and result is returned to operator.

## Config and startup

- Config: YAML file, validated with Zod. See `loadConfig` and `validateConfig` in `src/core/config.ts`.
- Startup: `src/index.ts` loads config, creates store/agent/gateway, starts enabled channels, registers SIGINT/SIGTERM for shutdown.
