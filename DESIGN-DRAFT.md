# Pandora — Remaining Design Work

This document tracks features from the original design that have **not yet been implemented**. Everything else from the original draft is built — see the actual codebase and docs for current architecture.

---

## 1. Tool Generation Flow

Users describe what they want in natural language; an LLM generates the tool; the SES Compartment sandboxes it.

### Design

1. User describes tool in natural language via UI
2. Coding agent generates: function code + input schema + permission declaration
3. UI shows review: "This tool requests: network `api.weatherapi.com`, env `WEATHER_API_KEY`"
4. User approves -> stored in DB -> active on next request -> runs in SES Compartment

```typescript
// What gets stored in DB
interface GeneratedToolRecord {
  id: string
  name: string
  description: string
  inputSchema: Record<string, any>   // JSON Schema
  code: string                        // LLM-generated function body
  permissions: ToolPermissions
  enabled: boolean
  createdAt: string
}
```

```javascript
// Example generated tool — sees only scoped globals
async function(input) {
  const response = await fetch(
    `https://api.weatherapi.com/v1/current.json?key=${env.get('WEATHER_API_KEY')}&q=${encodeURIComponent(input.city)}`,
  )
  const data = await response.json()
  return { temperature: data.current.temp_c, conditions: data.current.condition.text }
}
```

### What's Needed

- DB storage for generated tool records (via config store or dedicated table)
- API endpoint for tool generation (accepts natural language, returns code + schema + permissions for review)
- API endpoint for tool CRUD (create/enable/disable/delete generated tools)
- UI: Tool creation wizard (describe -> review generated code + permissions -> approve)
- Wire generated tools through `executeInCompartment()` (function exists in `packages/core/src/tools/sandbox/compartment.ts`, just needs to be called from the tool execution path)

---

## 2. Dockerfile

Docker containerization for self-hosted deployment.

### What's Needed

- Multi-stage Dockerfile (deps -> build -> runtime)
- `.dockerignore`
- Docker Compose example (app + database)
- Document in deployment docs

---

## 3. Environment Status Page

A unified view of the deployment environment. Low priority — health endpoint + discovery endpoints already cover most of this per-plugin.

### Design

```typescript
// GET /api/env-status
{
  runtime: 'bun',
  serverless: false,
  vars: {
    ANTHROPIC_API_KEY: { label: 'Anthropic (Claude)', set: true },
    OPENAI_API_KEY: { label: 'OpenAI (GPT)', set: false },
    // ...
  },
  warnings: [
    'DATABASE_URL points to a local file but you\'re running serverless — data won\'t persist.',
  ]
}
```

### What's Needed

- Dedicated `/api/env-status` endpoint aggregating all env vars across plugins
- UI: Environment page showing runtime, serverless flag, all env vars, warnings
- Evaluate whether this adds enough value over existing discovery endpoints
