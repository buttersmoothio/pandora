# Pandora

Your personal AI assistant that lives in your chat apps. Connect any AI model to Telegram, Discord, or other platforms — with the ability to delegate specialized tasks to expert sub-agents.

## What can Pandora do?

- **Chat anywhere** — Talk to AI through Telegram (more platforms coming)
- **Use any AI model** — Claude, GPT-4, Gemini, Mistral, and 50+ others through a single API key
- **Delegate to specialists** — The main AI can hand off coding questions to a "coder" agent, research tasks to a "research" agent, etc.
- **Remember conversations** — Persistent chat history stored in SQLite
- **Add your own capabilities** — Create custom tools, agents, or connect new platforms

## Quick start

**Prerequisites:** [Bun](https://bun.sh/) runtime

### 1. Install

```bash
git clone <repo-url> pandora
cd pandora
bun install
```

### 2. Get your API keys

You'll need:

| Service | What for | Where to get it |
|---------|----------|-----------------|
| **Vercel AI Gateway** | Access to AI models | [vercel.com/ai-gateway](https://vercel.com/ai-gateway) |
| **Telegram Bot** | Chat interface | [@BotFather](https://t.me/BotFather) on Telegram |
| **Your Telegram ID** | Owner authorization | [@userinfobot](https://t.me/userinfobot) on Telegram |

### 3. Configure

```bash
cp config.example.jsonc config.jsonc
```

Edit `config.jsonc`:

```jsonc
{
  "$schema": "./config.schema.jsonc",
  
  "ai": {
    "gateway": {
      "apiKey": "YOUR_VERCEL_AI_GATEWAY_KEY"
    },
    "agents": {
      "operator": {
        "model": "anthropic/claude-sonnet-4.5"
      }
    }
  },
  
  "channels": {
    "telegram": {
      "enabled": true,
      "token": "YOUR_TELEGRAM_BOT_TOKEN",
      "ownerId": "YOUR_TELEGRAM_USER_ID"
    }
  }
}
```

### 4. Run

```bash
bun run start
```

That's it! Message your bot on Telegram.

## Documentation

Run the docs site locally:

```bash
bun run dev --filter=@pandora/docs
```

Or read the docs directly:

| I want to... | Read this |
|--------------|-----------|
| Configure everything in detail | [packages/docs/content/configuration.mdx](packages/docs/content/configuration.mdx) |
| Add specialist sub-agents | [packages/docs/content/customization.mdx](packages/docs/content/customization.mdx) |
| Give AI new capabilities (tools) | [packages/docs/content/tools.mdx](packages/docs/content/tools.mdx) |
| Connect Discord or other platforms | [packages/docs/content/customization.mdx](packages/docs/content/customization.mdx) |
| Understand how it works | [packages/docs/content/how-it-works.mdx](packages/docs/content/how-it-works.mdx) |
| Set up Telegram bot properly | [packages/docs/content/telegram.mdx](packages/docs/content/telegram.mdx) |

## Project Structure

This is a monorepo with three packages:

```
packages/
├── core/       # @pandora/core - Framework (agent, gateway, registries)
├── pandora/    # @pandora/app  - Your extensions (subagents, tools, channels)
└── docs/       # @pandora/docs - Documentation site (Nextra)
```

## Supported AI models

Pandora uses [Vercel AI Gateway](https://vercel.com/ai-gateway), giving you access to 50+ models from:

- **Anthropic** — Claude 4, Claude Sonnet, Claude Haiku
- **OpenAI** — GPT-4o, GPT-4, GPT-3.5
- **Google** — Gemini Pro, Gemini Flash
- **Mistral** — Mistral Large, Mistral Medium
- **And more** — Cohere, Perplexity, Groq, etc.

Use model IDs like `anthropic/claude-sonnet-4.5` or `openai/gpt-4o` in your config.

## License

Private project.
