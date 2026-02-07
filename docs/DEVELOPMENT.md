# Development

How to extend Pandora. Extensions are auto-discovered — just create a file and it works.

## Adding extensions

All extensions use a **define pattern**: create a file, call the `define*()` function, done. No need to edit any index files or registration code.

### Add a subagent

Create `src/subagents/my-agent.ts`:

```typescript
import { z } from "zod";
import { defineSubagent } from "../core/registries/subagents";

export default defineSubagent({
  name: "myAgent",
  configKey: "myAgent",  // maps to config.ai.agents.myAgent
  
  instructions: `You are a specialized assistant for...`,
  
  toolDescription: "Delegate tasks to the myAgent specialist",
  
  inputSchema: z.object({
    task: z.string().describe("The task to complete"),
  }),
  
  inputField: "task",
  
  // Optional: override tool selection (default uses createToolsForAgent)
  // getTools: (config) => ({}),
});
```

Then add to `config.jsonc`:

```jsonc
"agents": {
  "operator": { "model": "..." },
  "myAgent": { "model": "anthropic/claude-sonnet-4.5" }
}
```

### Add a channel

Create `src/channels/discord/index.ts`:

```typescript
import { defineChannel, type Channel } from "../../core/registries/channels";

class DiscordChannel implements Channel {
  // ... implement Channel interface
}

export default defineChannel({
  name: "discord",
  configKey: "discord",
  create: (config, gateway) => new DiscordChannel(config, gateway),
});
```

Then add to `config.jsonc`:

```jsonc
"channels": {
  "discord": { "enabled": true, "ownerId": "...", "token": "..." }
}
```

### Add a tool

Create `src/tools/my-tool.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { defineTool } from "../core/registries/tools";

export default defineTool({
  name: "myTool",
  factory: (config) => ({
    name: "myTool",
    tool: tool({
      description: "Does something useful",
      inputSchema: z.object({ /* ... */ }),
      execute: async (params) => { /* ... */ },
    }),
    // Optional: restrict to specific agents
    // agents: ["operator", "coder"],
  }),
});
```

Then add to `config.jsonc`:

```jsonc
"tools": {
  "myTool": { /* tool-specific config */ }
}
```

### Add a storage backend

Create `src/store/postgres.ts`:

```typescript
import { defineStore, type IMessageStore } from "../core/registries/store";

class PostgresStore implements IMessageStore {
  // ... implement IMessageStore interface
}

export default defineStore({
  type: "postgres",
  create: (config) => new PostgresStore(config.connectionString),
});
```

Then use in `config.jsonc`:

```jsonc
"storage": {
  "type": "postgres",
  "connectionString": "postgresql://..."
}
```

## File naming conventions

- Files starting with `_` (e.g., `_helpers.ts`) are excluded from auto-discovery
- Channels are directories with an `index.ts` entry point
- Other extensions are single `.ts` files

## Codebase layout

```
src/
├── core/                  # Framework (don't modify unless contributing)
│   ├── index.ts           # Entry point
│   ├── registries/        # Extension registries (defineSubagent, defineTool, etc.)
│   ├── loader.ts          # Auto-discovery logic
│   ├── agent.ts           # Operator runtime
│   ├── gateway.ts         # Message routing
│   ├── config.ts          # Config loading and validation
│   ├── logger.ts          # Logging
│   ├── providers.ts       # AI model factory
│   └── types.ts           # Core types
├── subagents/             # User-defined subagents
├── channels/              # User-defined channels
├── tools/                 # User-defined tools
└── store/                 # User-defined storage backends
```

## AI providers

Providers are accessed through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Use gateway model IDs like `provider/model-name` (e.g. `anthropic/claude-sonnet-4.5`, `openai/gpt-4o`). No individual provider setup needed.

## Testing

Use Bun: `bun test`.
