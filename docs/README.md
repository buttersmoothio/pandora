# Pandora documentation

High-level docs only; API and implementation details are in **JSDoc** in the source (`src/`).

| Document | Description |
|----------|-------------|
| [**Architecture**](ARCHITECTURE.md) | Overview, data flow, operator/subagents, extension system. |
| [**Configuration**](CONFIGURATION.md) | Config schema, dynamic settings, built-in components. |
| [**Development**](DEVELOPMENT.md) | Adding subagents, channels, tools, storage backends. |
| [**Telegram**](TELEGRAM.md) | Telegram channel setup and behavior. |

## Quick reference

| To add... | Create file | Config key |
|-----------|-------------|------------|
| Subagent | `src/subagents/my-agent.ts` | `ai.agents.myAgent` |
| Channel | `src/channels/discord/index.ts` | `channels.discord` |
| Tool | `src/tools/my-tool.ts` | `ai.tools.myTool` |
| Storage | `src/store/postgres.ts` | `storage.type: "postgres"` |

All extensions are **auto-discovered** — no index files to edit.

## Code documentation

- **Getting started** — [Main README](../README.md)
- **Core framework** — `src/core/` (agent, gateway, config, registries, loader)
- **Extension examples** — `src/subagents/`, `src/channels/`, `src/tools/`, `src/store/`
- **Types & interfaces** — JSDoc in `src/core/types.ts`, `src/core/registries/`
