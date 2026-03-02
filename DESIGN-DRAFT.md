# Pandora — Remaining Design Work

This document tracks features from the original design that have **not yet been implemented**. Everything else from the original draft is built — see the actual codebase and docs for current architecture.

---

## 1. Scheduling System

Agents should be able to run tasks on a schedule — daily summaries, periodic checks, etc.

### Design

```typescript
interface ScheduledTask {
  id: string
  cron: string           // '*/30 * * * *'
  prompt: string         // What to tell the agent
  threadId?: string      // Optional: continue a specific thread
  enabled: boolean
}

interface Scheduler {
  register(task: ScheduledTask): Promise<void>
  remove(taskId: string): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}
```

**Server mode:** In-process scheduler (node-cron or setInterval). Started after server is listening.

```typescript
// Server mode: in-process
const job = cron.schedule(task.cron, async () => {
  const agent = mastra.getAgent('operator')
  await agent.generate(task.prompt, {
    threadId: task.threadId ?? `schedule-${task.id}`,
    resourceId: 'system',
  })
})
```

**Serverless mode:** Platform cron hits `POST /api/cron/:taskId`. Task config stored in DB.

```typescript
// Serverless mode: cron endpoint
app.post('/api/cron/:taskId', authMiddleware, async (c) => {
  const taskId = c.req.param('taskId')
  const config = await getConfig(storage)
  const task = config.schedule.tasks.find((t) => t.id === taskId)
  if (!task?.enabled) return c.json({ skipped: true })

  const agent = mastra.getAgent('operator')
  await agent.generate(task.prompt, {
    threadId: task.threadId ?? `schedule-${task.id}`,
    resourceId: 'system',
  })
  return c.json({ ok: true, taskId })
})
```

### What's Needed

- Config schema: add `schedule.tasks[]` section
- Scheduler implementations (local + endpoint)
- UI: Schedule management page (create/edit/delete tasks, cron expression, enable/disable, last run status)
- Serverless guidance in UI for setting up platform cron (Vercel Cron, CF Cron Triggers)

---

## 2. Security Processors

AI-based input/output processing to guard against prompt injection, PII leakage, content moderation failures, and system prompt extraction.

### Design

Mastra agents support `inputProcessors` and `outputProcessors` arrays. These run before/after the LLM call.

```typescript
// Operator creation with security processors
const operator = new Agent({
  // ... existing config ...
  inputProcessors: buildInputProcessors(config),
  outputProcessors: buildOutputProcessors(config),
})

function buildInputProcessors(config: PandoraConfig) {
  const m = config.models.security  // fast/cheap model for classification
  const p = []
  p.push(new UnicodeNormalizer({ stripControlChars: true, collapseWhitespace: true }))
  if (config.security.promptInjection.enabled)
    p.push(new PromptInjectionDetector({ model: m, strategy: 'block', threshold: config.security.promptInjection.threshold }))
  if (config.security.piiRedaction.enabled)
    p.push(new PIIDetector({ model: m, strategy: 'redact' }))
  if (config.security.moderation.enabled)
    p.push(new ModerationProcessor({ model: m, strategy: 'block' }))
  return p
}

function buildOutputProcessors(config: PandoraConfig) {
  const m = config.models.security
  const p = []
  if (config.security.systemPromptScrubbing.enabled)
    p.push(new SystemPromptScrubber({ model: m, strategy: 'redact' }))
  if (config.security.piiRedaction.enabled)
    p.push(new PIIDetector({ model: m, strategy: 'redact' }))
  p.push(new TokenLimiterProcessor({ limit: 4000, strategy: 'truncate' }))
  return p
}
```

### Config

```typescript
security: {
  promptInjection: { enabled: boolean, threshold: number },
  piiRedaction: { enabled: boolean },
  moderation: { enabled: boolean },
  systemPromptScrubbing: { enabled: boolean },
}
```

### What's Needed

- Investigate Mastra's current processor support (API may have changed since draft)
- Config schema: add `security` section + `models.security` field
- Operator creation: wire processors based on config
- UI: Security processors toggle in Config or Security page

---

## 3. MCP Tool Support

External tools via Model Context Protocol.

### Design

```typescript
import { MCPClient } from '@mastra/mcp'

const mcpTools = await new MCPClient({
  servers: config.mcpServers,
}).getTools()
```

MCP tools are treated as untrusted: description validation, user approval for new servers, all communication logged. Tool annotations already support MCP-compatible metadata (`readOnlyHint`, `destructiveHint`, etc.).

### What's Needed

- `@mastra/mcp` integration (check current Mastra support)
- Config: MCP server list (name, command/URL, args)
- UI: MCP server management in Tools page (add/remove servers, view available tools)

---

## 4. Tool Generation Flow

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

## 5. Working Memory

Per-resource persistent preferences and context. Preferences set via Telegram are available in web chat.

Mastra Memory supports `workingMemory: { enabled: true }` — structured data that persists across conversations for a given resource (user).

### What's Needed

- Verify Mastra's current working memory API
- Config schema: add `memory.workingMemory: { enabled: boolean }` (or similar)
- Wire through in `packages/core/src/memory/index.ts` when creating the Memory instance

---

## 6. Observational Memory

Background compression of conversation history for 60-80% context reduction.

### What's Needed

- Investigate whether Mastra Memory currently supports observational/compression features
- If supported: expose in config and wire through
- If not: evaluate alternatives or defer

---

## 7. Dockerfile

Docker containerization for self-hosted deployment.

### What's Needed

- Multi-stage Dockerfile (deps -> build -> runtime)
- `.dockerignore`
- Docker Compose example (app + database)
- Document in deployment docs

---

## 8. Environment Status Page

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
