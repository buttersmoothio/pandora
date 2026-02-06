# Configuration

Pandora uses a JSONC file (`config.jsonc` by default). Copy `config.example.jsonc` to `config.jsonc` and fill in your values. Config types and validation are documented in `src/core/config.ts` (JSDoc and Zod schemas).

JSONC supports comments (`//` and `/* */`) and trailing commas for easier configuration.

For IDE autocompletion, add `"$schema": "./config.schema.jsonc"` at the top of your `config.jsonc` file.

## Schema summary

| Section | Description |
|---------|-------------|
| **ai.providers** | API keys for `openai`, `anthropic`, `minimax`. |
| **ai.tools** | Tool configurations. Add entries here to enable tools. Tools declare agent compatibility in their code. |
| **ai.agents** | **operator** (required), optional **coder**, **research**. Each agent has `provider`, `model`, optional `description`. Tools are automatically assigned. |
| **storage** | Optional. `type`: `sqlite` or `memory`. `path`: DB path (default `data/pandora.db`) for SQLite. |
| **channels.telegram** | Optional. `enabled`, `token` (from [@BotFather](https://t.me/BotFather)), `ownerId` (from [@userinfobot](https://t.me/userinfobot)). |

## How tools work with agents

Each tool declares which agents it supports in its code (the `agents` field). This keeps tool-agent relationships centralized rather than scattered across agent configs.

**General-purpose tools** (like `datetime`) have no `agents` restriction and are available to all agents.

**Specialized tools** (like `tavilySearch`) can restrict themselves to specific agents by setting `agents: ["operator", "research"]` in their definition.

## Available tools

| Tool | Config required | Description | Agents |
|------|-----------------|-------------|--------|
| `datetime` | No | Returns current date and time | All |
| `tavilySearch` | `apiKey` | Web search using Tavily API | operator, research |

To add a new tool:
1. Create a new file in `src/tools/` (e.g., `my-tool.ts`)
2. Export a `createMyTool()` function that returns a `ToolDefinition`
3. Register it in `src/tools/index.ts`
4. Add it to `config.jsonc` with any required config
5. Optionally set `agents: [...]` to restrict which agents can use it (omit for all agents)

## Validation errors

- Missing config file, invalid JSON, or Zod validation errors (path + message).
- Agent uses a provider that is not configured or has no API key.
- Configured tool is not a known tool (not in the registry).
