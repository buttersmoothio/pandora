# Pandora

A personal AI agent framework. See [DESIGN-DRAFT.md](./DESIGN-DRAFT.md) for architecture.

## Project Structure

```
packages/
  core/           # Hono server (auth, storage, AI agent)
  ui/             # Next.js chat interface
  docs/           # Nextra documentation site
  storage-*/      # Storage provider packages
```

## Development

```bash
bun install            # Install dependencies
bun run dev            # Run all packages in dev mode
bun run check:fix      # Lint & format (Biome)
bun run build          # Build all packages
bun run test           # Run tests (do not use bun test)
```

Type checking: `bun run typecheck`

## Code Style

Biome — single quotes, no semicolons, 2-space indent, trailing commas, 100 char line width.

Run `bun run check:fix` before committing.

## Documentation

Docs live in `packages/docs/content/`. Run locally with `cd packages/docs && bun run dev`.

### Structure

| Section | Path | Audience | Purpose |
|---------|------|----------|---------|
| Top-level pages | `content/*.mdx` | End users | Day-to-day usage |
| Plugins | `content/plugins/*.mdx` | Users + developers | Plugin usage and plugin development guides |
| API Reference | `content/api-reference/*.mdx` | Developers | REST endpoint specs, request/response formats, type definitions |

### Writing Guidelines

- **No internals.** Never expose implementation details: library names (SES, Mastra, LibSQL, ts-blank-space), internal tool names (`send_to`, `current_time`), internal config flags (`onboardingComplete`), thread naming conventions (`schedule-<id>`), specific algorithm details (PBKDF2 iterations), or encoding schemes (base64url). Describe *what* things do, not *how* they're built.
- **User docs describe the UI and behavior.** Write as if guiding someone through the product. Reference page names ("the Config page", "the Plugins page"), not code paths.
- **Developer docs describe the SDK and API contract.** Types, interfaces, and endpoints are fair game. Internal wiring (loader behavior, middleware ordering, storage internals) is not.
- **Keep pages focused on their audience.** A user page shouldn't mention manifests. A plugin development page shouldn't explain how the sandbox is implemented internally.
- **Cross-reference, don't duplicate.** Link to other pages instead of restating content. Use `[Page Name](/path)` links.
- **Verify against code.** Every config option, API endpoint, parameter, and default value must match the actual codebase. When in doubt, read the source.

## Definition of Done

A task is complete when all of the following pass:

1. `bun run typecheck` — no new type errors
2. `bun run test` — all existing tests pass
3. `bun run check:fix` — lint and format clean
4. Relavant user documentation is updated if needed.
5. Developer documentation and architecture are documented if needed.