# Pandora

A personal AI agent framework. See [DESIGN-DRAFT.md](./DESIGN-DRAFT.md) for architecture.

## Project Structure

```
packages/
  core/           # Hono server (auth, storage, AI agent)
  ui/             # Next.js chat interface
  docs/           # Nextra documentation site
  elements/       # Composable AI chat UI components
  storage-*/      # Storage provider packages
```

## Development

```bash
bun install            # Install dependencies
bun run dev            # Run all packages in dev mode
bun run check:fix      # Lint & format (Biome)
bun run build          # Build all packages
```

Type checking: `bun run typecheck`

## Code Style

Biome — single quotes, no semicolons, 2-space indent, trailing commas, 100 char line width.

Run `bun run check:fix` before committing.

## Documentation

Docs live in `packages/docs/content/`. Run locally with `cd packages/docs && bun run dev`.

The docs are organized into four sections with distinct audiences:

- **Quick Start** — single page, zero to working setup as fast as possible
- **User Guide** — day-to-day settings and configuration (user manual)
- **Developer Guide** — API integration, custom UIs, custom storage/auth backends (tinkerer's manual)
- **Architecture** — high-level design decisions only. Code is law — don't restate implementation details that someone can read in the source. Focus on the *why* and the shape of the system, not the *how*.

When adding docs, only include content relevant to each section's audience. Quick Start should stay as one page.

## Definition of Done

A task is complete when all of the following pass:

1. `bun run typecheck` — no new type errors
2. `bun run test` — all existing tests pass
3. `bun run check:fix` — lint and format clean
4. Relavant user documentation is updated if needed.
5. Developer documentation and architecture are documented if needed.