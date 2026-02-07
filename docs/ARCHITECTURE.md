# Architecture

High-level design and data flow. For types, method signatures, and parameters see JSDoc in the source (e.g. `src/core/types.ts`, `gateway.ts`, `agent.ts`).

## Overview

- **Channels** — Inbound/outbound messaging (Telegram). Turn platform events into `Message`, call gateway handler, send reply.
- **Gateway** — Receives messages, stores them, loads history, calls agent, stores and returns response.
- **Store** — Conversation history (SQLite or in-memory, or custom backends).
- **Agent** — Operator + optional subagents (coder, research, webSearch, or custom). Operator handles chat and delegates via tools.

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
- **Subagents** — Optional coder/research/webSearch (or custom); exposed as tools. When operator calls a tool, subagent runs and result is returned to operator.
  - **coder** — Programming, debugging, code review
  - **research** — Information gathering, fact-checking, explanations
  - **webSearch** — Live internet searches using search-enabled models (e.g. `openai/gpt-4o-mini-search-preview`)

## Extension architecture

The codebase separates framework code from user extensions:

```
src/
├── core/              # Framework (internals)
│   ├── registries/    # Extension point definitions (defineSubagent, defineTool, etc.)
│   ├── loader.ts      # Auto-discovery of extensions
│   └── ...
├── subagents/         # User extensions (auto-discovered)
├── channels/          # User extensions (auto-discovered)
├── tools/             # User extensions (auto-discovered)
└── store/             # User extensions (auto-discovered)
```

Extensions self-register by calling `define*()` functions from `src/core/registries/`. The loader auto-discovers all `.ts` files in extension directories at startup.

## Config and startup

- Config: JSONC file (`config.jsonc`), validated with Zod. Supports comments and trailing commas. Dynamic schema allows any subagent, channel, or storage type. See `src/core/config.ts`.
- Startup (`src/core/index.ts`):
  1. Auto-discover and load all extensions (triggers registration)
  2. Load and validate config
  3. Create store, agent, gateway
  4. Create and start enabled channels
  5. Register SIGINT/SIGTERM for graceful shutdown
