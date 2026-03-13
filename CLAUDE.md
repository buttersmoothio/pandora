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

Biome handles formatting and most lint rules — run `bun run check:fix` before committing.

## Coding Standards

### Types

- Use `interface` for contracts and object shapes (stores, registries, component props). Use `type` for unions, intersections, mapped types, and inferred types.
- Derive types from Zod schemas with `z.infer<typeof Schema>`. Export both the schema and the type.
- Use `as const` arrays with `ReadonlySet` when you need runtime membership checks.
- Avoid `as` casts — restructure code or use type guards to narrow naturally. Never use `as any` or `as unknown as T`.
- Never silently swallow errors in catch blocks. At minimum, log them.

### Module Organization

- No default exports (except where framework requires it, e.g. Next.js pages).
- File suffixes: `-store` (persistence interfaces), `-provider` (implementations), `-types` (type exports).
- Private/cached mutable refs: leading underscore (`_runtime`, `_cached`).
- Tests live in a `tests/` subfolder within each module directory (e.g. `runtime/tests/`, `auth/tests/`).

### Logging

- Use `getLogger()` from `../logger`.
- Prefix log messages with the module name in brackets: `[runtime]`, `[scheduler]`, `[stream-store]`.
- Structured data goes in the second argument: `log.info('[runtime] loaded tools', { toolIds })`.

### Patterns

- Use `HTTPException` for errors in Hono routes.
- Async factory functions instead of constructors when initialization requires async work (e.g. `Agent.create()`, `createRuntime()`).
- Provider pattern for pluggable implementations: abstract interface + concrete implementations in a `providers/` directory.
- Higher-order functions for middleware: return `createMiddleware(...)` from a factory that accepts dependencies.
- Promise deduplication for concurrent requests: cache the in-flight promise and clear it in `.finally()`.
- Discriminated unions with a `type` field for polymorphic data.
- Dynamic imports are only acceptable for SES lockdown conflicts, optional peer dependencies, or plugin entry points. Use static imports everywhere else.

## Documentation

Docs live in `packages/docs/content/`. Run locally with `cd packages/docs && bun run dev`.

### Structure

| Section | Path | Audience | Purpose |
|---------|------|----------|---------|
| Top-level pages | `content/*.mdx` | End users | Day-to-day usage |
| Plugins | `content/plugins/*.mdx` | Users | Plugin usage and available plugins |
| Extending Pandora | `content/extending-pandora/*.mdx` | Developers | Building tools, agents, channels, and custom UIs |
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