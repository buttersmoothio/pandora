# Pandora

A multi-channel AI agent with an **operator + subagent** architecture. The main operator handles general conversation and can delegate specialized tasks (coding, research, web search) to subagents. Messages are received from channels (e.g. Telegram), stored, and processed by the AI; responses are stored and sent back.

## Features

- **Operator / subagent model** — One main AI orchestrates chat and delegates to optional subagents (coder, research, webSearch, or your own).
- **Multi-provider AI** — Access any provider (OpenAI, Anthropic, Google, Mistral, etc.) through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) with a single API key.
- **Channels** — Telegram today; designed for more (Discord, Slack, etc.).
- **Storage** — SQLite (persistent) or in-memory (ephemeral), or add your own.
- **Auto-discovery** — Add subagents, channels, tools, or storage backends by creating a single file. No registration code needed.
- **Config** — JSONC configuration file with IDE autocompletion support.

## Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)

## Quick start

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure**

   Copy the example config and set your values:

   ```bash
   cp config.example.jsonc config.jsonc
   ```

   Edit `config.jsonc`:

   - **AI Gateway**: Set your `apiKey` from [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Configure `operator` agent with a model ID (e.g. `anthropic/claude-sonnet-4.5`); optionally add `coder`, `research`, or `webSearch` subagents.
   - **Storage**: `type: sqlite` and `path: data/pandora.db` (or `memory` for no persistence).
   - **Telegram**: `enabled: true`, `token` from [@BotFather](https://t.me/BotFather), `ownerId` from [@userinfobot](https://t.me/userinfobot).

3. **Run**

   ```bash
   bun run start
   ```

   Or with watch (restart on file changes):

   ```bash
   bun run dev
   ```

## Project structure

```
pandora/
├── config.example.jsonc  # Example configuration (copy to config.jsonc)
├── config.schema.jsonc   # JSON schema for IDE autocompletion
├── src/
│   ├── core/             # Framework (don't modify)
│   │   ├── index.ts      # Entry point
│   │   ├── registries/   # Extension registries
│   │   ├── agent.ts      # Operator runtime
│   │   ├── gateway.ts    # Message routing
│   │   ├── config.ts     # Config loading
│   │   ├── loader.ts     # Auto-discovery
│   │   └── ...
│   ├── subagents/        # User-defined subagents (auto-discovered)
│   ├── channels/         # User-defined channels (auto-discovered)
│   ├── tools/            # User-defined tools (auto-discovered)
│   └── store/            # User-defined storage backends (auto-discovered)
└── docs/                 # Documentation
```

## Scripts

| Script   | Command              | Description                    |
|----------|----------------------|--------------------------------|
| Start    | `bun run start`      | Run the agent                  |
| Dev      | `bun run dev`        | Run with watch (auto-restart)  |

## Documentation

- [**Docs index**](docs/README.md) — Overview of all docs
- [**Architecture**](docs/ARCHITECTURE.md) — Data flow, operator/subagents
- [**Configuration**](docs/CONFIGURATION.md) — Config schema summary
- [**Development**](docs/DEVELOPMENT.md) — Adding channels, subagents, tools, storage
- [**Telegram**](docs/TELEGRAM.md) — Telegram channel setup and behavior

Function and type details are in **JSDoc** in the source (`src/`).

## License

Private project.
