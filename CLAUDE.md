# Pandora AI Agent

Personal AI assistant with multi-channel support. Bun + Turbo monorepo.

## Structure

```
packages/
  core/       @pandora/core   — Framework: agent, gateway, registries, types
  pandora/    @pandora/app    — App: channels, subagents, tools, stores
  web/        @pandora/web    — Web UI: Next.js + shadcn/ui + AI Elements
  docs/       @pandora/docs   — Docs: Nextra
```

## Commands

```bash
bun install                            # Install all deps
bun run dev                            # Start everything (Turbo)
bun run --filter @pandora/app dev      # Backend only (port 3000)
bun run --filter @pandora/web dev      # Web UI only (port 3001)
bun run --filter @pandora/docs dev     # Docs only (port 8080)
```

## Documentation

The docs (`packages/docs/content/`) are the single source of truth. Read the relevant doc before modifying code in that area.

| Topic | Doc path |
|-------|----------|
| Architecture & message flow | `reference/architecture.mdx` |
| Gateway & Agent API | `reference/api.mdx` |
| REST endpoints | `reference/api.mdx` (REST API section) |
| WebSocket protocol | `reference/websocket-protocol.mdx` |
| Types (Message, StreamEvent, etc.) | `reference/types.mdx` |
| Configuration fields | `reference/configuration.mdx` |
| Configuration guide | `configuration.mdx` |
| Extension system (channels, tools, subagents, store, memory) | `extensions/*.mdx` |
| Web channel setup | `channels/web.mdx` |
| Telegram channel setup | `channels/telegram.mdx` |
| Agents (operator, coder, web search) | `agents/*.mdx` |
| Tools (datetime, search APIs) | `tools/*.mdx` |
| Storage backends | `storage/*.mdx` |
| Memory system | `memory/*.mdx` |
| Security | `reference/security.mdx` |

## Style

- TypeScript strict mode, semicolons
- JSDoc on public APIs (concise). `/** One-liner */` for simple fields
- Use Telegram channel as reference pattern for new channels

## Documentation Conventions

The docs have four sections with strict content boundaries:

| Section | Audience | Content allowed | Content NOT allowed |
|---------|----------|-----------------|---------------------|
| **Getting Started** | New users | What Pandora is, why use it, get running | Config details, internals |
| **Using Pandora** | Day-to-day users | Config tables, feature descriptions, "what/why/how to configure" | SQL schemas, algorithm weights, source file paths, class/method names, code internals |
| **Building Extensions** | Developers writing custom code | Templates, patterns, API surfaces for extension authors | User-facing setup steps (link instead) |
| **Reference** | Anyone needing exhaustive detail | Schemas, types, API surfaces, architecture, algorithms, internals | Getting-started material |

**Rules:**
- "Using Pandora" pages must never contain: SQL schemas, algorithm parameters (weights, thresholds, token counts), source file paths (`packages/*/src/...`), class/method names (`ToolLoopAgent`, `addActionTools()`, `defineSubagent()`), or numbered implementation steps.
- When removing internals from a user page, add a brief description + link to the relevant reference page.
- Implementation details moved out of user pages go into `reference/architecture.mdx` under `<details>` blocks.

## Post-Change Checklist

After every code change, update the relevant docs (respecting the section boundaries above):

- [ ] Types changed → `reference/types.mdx`
- [ ] REST endpoints changed → `reference/api.mdx`
- [ ] WebSocket events changed → `reference/websocket-protocol.mdx`
- [ ] Config schema changed → `reference/configuration.mdx`
- [ ] Gateway/Agent API changed → `reference/api.mdx`
- [ ] New/changed tool → `tools/*.mdx`, `extensions/tools.mdx`
- [ ] New/changed subagent → `agents/*.mdx`
- [ ] New/changed channel → `channels/*.mdx`, `extensions/channels.mdx`
- [ ] Store interface changed → `storage/*.mdx`, `extensions/storage.mdx`
- [ ] Memory interface changed → `memory/*.mdx`, `extensions/memory.mdx`
- [ ] Extension patterns changed → `extensions/*.mdx`
- [ ] Internals moved → Ensure corresponding addition in `reference/architecture.mdx`
