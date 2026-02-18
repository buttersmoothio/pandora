# Pandora Development Guide

## Overview

Pandora is a multi-runtime AI agent framework built on Hono. See [DESIGN-DRAFT.md](./DESIGN-DRAFT.md) for architecture details.

## Project Structure

```
packages/
  core/        # Core Hono server with SES hardening
  docs/        # Nextra documentation site
```

## Quick Start

```bash
# Install dependencies (from root)
bun install

# Run all packages in dev mode
bun run dev

# Run just the core server
cd packages/core && bun run dev
```

## Development Commands

```bash
# Linting & formatting (Biome)
bun run check          # Check for issues
bun run check:fix      # Fix issues

# Type checking
cd packages/core && bun run typecheck

# Build
bun run build
```

## Code Style

This project uses Biome with:
- Single quotes, no semicolons
- 2-space indent, trailing commas
- Line width 100

Run `bun run check:fix` before committing.

## Adding New Code

### New endpoint in core

Edit `packages/core/src/index.ts`:
```typescript
app.get('/api/my-endpoint', (c) => {
  return c.json({ message: 'Hello' })
})
```

### New environment variable

1. Add to schema in `packages/core/src/env.ts`
2. Use via `getEnv(c)` in request handlers

## Documentation

- **Local docs**: `cd packages/docs && bun run dev` (runs on http://localhost:3000)
- **Architecture**: See [DESIGN-DRAFT.md](./DESIGN-DRAFT.md)

## Key Patterns

- **SES Lockdown**: Enabled at startup for security hardening
- **Environment detection**: `detectEnvironment()` returns runtime info
- **Multi-runtime**: Same code runs on Bun, Cloudflare Workers, Vercel Edge
