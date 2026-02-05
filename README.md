# Pandora

A multi-channel AI agent with an **operator + subagent** architecture. The main operator handles general conversation and can delegate specialized tasks (coding, research) to subagents. Messages are received from channels (e.g. Telegram), stored, and processed by the AI; responses are stored and sent back.

## Features

- **Operator / subagent model** — One main AI (e.g. MiniMax) orchestrates chat and delegates to optional subagents (coder, research).
- **Multi-provider AI** — OpenAI, Anthropic, and MiniMax via [Vercel AI SDK](https://sdk.vercel.ai/).
- **Channels** — Telegram today; designed for more (Discord, Slack, etc.).
- **Storage** — SQLite (persistent) or in-memory (ephemeral).
- **Config** — YAML configuration file.

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
   cp config.example.yaml config.yaml
   ```

   Edit `config.yaml`:

   - **AI**: Set at least one provider (e.g. `minimax`) and its `apiKey`. Operator uses that provider/model; optionally add `coder` and `research` subagents.
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
├── config.example.yaml   # Example configuration (copy to config.yaml)
├── src/
│   ├── index.ts          # Entry: loads config, creates store/agent/gateway, starts channels
│   ├── core/             # Agent, gateway, config, types, providers, subagents, logger
│   ├── channels/         # Channel implementations (Telegram, base types)
│   └── store/            # Message storage (memory, SQLite)
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
- [**Development**](docs/DEVELOPMENT.md) — Adding channels, subagents, providers
- [**Telegram**](docs/TELEGRAM.md) — Telegram channel setup and behavior

Function and type details are in **JSDoc** in the source (`src/`).

## License

Private project.
