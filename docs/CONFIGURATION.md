# Configuration

Pandora uses a YAML file (`config.yaml` by default). Copy `config.example.yaml` to `config.yaml` and fill in your values. Config types and validation are documented in `src/core/config.ts` (JSDoc and Zod schemas).

## Schema summary

| Section | Description |
|--------|-------------|
| **ai** | Required. `providers`: API keys for openai, anthropic, minimax. `agents`: **operator** (required), optional **coder**, **research**. Each agent has `provider`, `model`, optional `description`. |
| **storage** | Optional. `type`: `sqlite` or `memory`. `path`: DB path (default `data/pandora.db`) for SQLite. |
| **channels.telegram** | Optional. `enabled`, `token` (from [@BotFather](https://t.me/BotFather)), `ownerId` (from [@userinfobot](https://t.me/userinfobot)). |

Every configured agent must have its provider and API key set under `ai.providers`. Validation runs at startup via `validateConfig()`.

## Validation errors

- Missing config file, invalid YAML, or Zod validation errors (path + message).
- Agent uses a provider that is not configured or has no API key.
