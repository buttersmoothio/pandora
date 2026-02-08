# Pandora

A minimal, hackable AI assistant built on the [Vercel AI SDK](https://sdk.vercel.ai).

Pandora takes a different approach: instead of building everything from scratch, it composes proven libraries into a clean architecture you can actually understand. The entire core is ~3k lines of TypeScript. Add a sub-agent by creating one file. Add a tool by creating one file. No boilerplate — just code.

**Key ideas:**

- **Multi-agent delegation** — An operator routes tasks to specialists (coder, research, web search). Use fast models for chat, powerful models for coding.
- **Cross-channel streaming** — Messages from Telegram stream live to the web UI. Watch any conversation from anywhere.
- **Single config file** — One `config.jsonc` controls everything. No dashboards, no pairing codes.
- **Any AI model** — Supports any model the Vercel AI SDK supports. Claude, GPT-4, Gemini, Perplexity, Mistral, and more.

## Quick Start

```bash
git clone <repo-url> pandora && cd pandora
bun install
cp config.example.jsonc config.jsonc
# Edit config.jsonc with your API keys
bun run dev
```

Open `http://localhost:3001`, enter your token, start chatting.

## Documentation

Full docs at `http://localhost:8080` when running, or browse [packages/docs/content/](packages/docs/content/).

## Project Structure

```
packages/
├── core/       # Framework (agent, gateway, types)
├── pandora/    # App (channels, subagents, tools)
├── web/        # Web UI (Next.js)
└── docs/       # Documentation (Nextra)
```

## Commands

```bash
bun run dev                            # Start everything
bun run --filter @pandora/app dev      # Backend only (port 3000)
bun run --filter @pandora/web dev      # Web UI only (port 3001)
```

## vs OpenClaw

[OpenClaw](https://github.com/openclaw/openclaw) is feature-rich with more channels out of the box. Pandora is for developers who want a clean, hackable foundation they fully understand. See [docs](packages/docs/content/index.mdx) for detailed comparison.

## License

Private project.
