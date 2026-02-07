# Configuration

Pandora uses a JSONC file (`config.jsonc` by default). Copy `config.example.jsonc` to `config.jsonc` and fill in your values. Config types and validation are documented in `src/core/config.ts` (JSDoc and Zod schemas).

JSONC supports comments (`//` and `/* */`) and trailing commas for easier configuration.

For IDE autocompletion, add `"$schema": "./config.schema.jsonc"` at the top of your `config.jsonc` file.

## Schema summary

| Section | Description |
|---------|-------------|
| **ai.gateway** | Vercel AI Gateway configuration with `apiKey`. Single key for all providers. |
| **ai.tools** | Tool configurations. Add entries here to enable tools. Tools are auto-discovered from `src/tools/`. |
| **ai.agents** | **operator** (required), plus any subagents (e.g., `coder`, `research`, `webSearch`, or custom). Each agent has `model` (gateway model ID like `anthropic/claude-sonnet-4.5`). |
| **storage** | Optional. `type`: any registered backend (default `sqlite`). `path`: DB path for file-based backends. |
| **channels** | Channel configurations. Channels are auto-discovered from `src/channels/`. Each channel has `enabled`, `ownerId`, and channel-specific fields. |
| **logLevel** | Optional. `"normal"` (default) or `"verbose"` (logs full model prompts and responses). |

## Dynamic configuration

The config schema is intentionally permissive for extensibility:

- **Agents**: Any subagent name is accepted (maps to files in `src/subagents/`)
- **Channels**: Any channel name is accepted (maps to directories in `src/channels/`)
- **Storage**: Any type string is accepted (maps to files in `src/store/`)
- **Tools**: Any tool name is accepted (maps to files in `src/tools/`)

This means you can add custom extensions without modifying the config schema.

## How tools work with agents

Each tool declares which agents it supports in its code (the `agents` field). This keeps tool-agent relationships centralized rather than scattered across agent configs.

**General-purpose tools** (like `datetime`) have no `agents` restriction and are available to all agents.

**Specialized tools** (like `tavilySearch`) can restrict themselves to specific agents by setting `agents: ["operator", "research"]` in their definition.

## Built-in tools

| Tool | Config required | Description | Default agents |
|------|-----------------|-------------|----------------|
| `datetime` | No | Returns current date and time | All |
| `tavilySearch` | `apiKey` | Web search using Tavily API | All |

## Built-in subagents

| Subagent | Description | Recommended model |
|----------|-------------|-------------------|
| **coder** | Programming, debugging, code review | Any capable model (e.g. `anthropic/claude-sonnet-4.5`) |
| **research** | Information gathering, explanations, fact-checking | Any capable model |
| **webSearch** | Live internet searches, current events, real-time info | Search-enabled model (e.g. `openai/gpt-4o-mini-search-preview`) |

## Adding new components

Extensions are auto-discovered. Just create a file:

| Component | Create file | Add to config |
|-----------|-------------|---------------|
| Subagent | `src/subagents/my-agent.ts` | `ai.agents.myAgent: { model: "..." }` |
| Channel | `src/channels/discord/index.ts` | `channels.discord: { enabled: true, ... }` |
| Tool | `src/tools/my-tool.ts` | `ai.tools.myTool: { ... }` |
| Storage | `src/store/postgres.ts` | `storage.type: "postgres"` |

See [Development](DEVELOPMENT.md) for code examples.

## Validation errors

- Missing config file, invalid JSON/JSONC, or Zod validation errors (path + message).
- Gateway API key is missing.
- Configured tool is not a known tool (not in the registry).
