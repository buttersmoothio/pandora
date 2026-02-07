# Customization Guide

Pandora is designed to be extended. You can add:

- **Sub-agents** — Specialized AI assistants for specific tasks
- **Tools** — New capabilities like API integrations, file operations, etc.
- **Channels** — Connect to Discord, Slack, or other platforms
- **Storage backends** — Use Postgres, Redis, or any database

All extensions are **auto-discovered** — just create a file in the right folder and it works. No registration code or index files to edit.

## Sub-agents

Sub-agents are specialists that the main operator can delegate to. Want a "translator" agent? A "writing assistant"? Create it in minutes.

### Creating a sub-agent

**1. Create the file**

Create `src/subagents/translator.ts`:

```typescript
import { z } from "zod";
import { defineSubagent } from "../core/registries/subagents";

export default defineSubagent({
  // Unique name (used in logging)
  name: "translator",
  
  // Config key (maps to config.ai.agents.translator)
  configKey: "translator",
  
  // Instructions for this specialist
  instructions: `You are an expert translator. You translate text between languages 
accurately while preserving tone, idioms, and cultural context.

When given text to translate:
1. Identify the source language (or ask if unclear)
2. Translate to the requested target language
3. Note any idioms or cultural references that don't translate directly

Always be precise and maintain the original meaning.`,

  // How the operator sees this tool
  toolDescription: "Translate text between languages with cultural awareness",
  
  // What input the operator provides
  inputSchema: z.object({
    text: z.string().describe("The text to translate"),
    targetLanguage: z.string().describe("The language to translate to"),
  }),
  
  // Which field contains the main prompt
  inputField: "text",
});
```

**2. Add to config**

Edit `config.jsonc`:

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "translator": { "model": "anthropic/claude-sonnet-4.5" }
}
```

**3. Done!**

Restart Pandora. The operator can now delegate translation tasks.

### Sub-agent options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for logging |
| `configKey` | Yes | Key in `config.ai.agents` (e.g., "translator" → `agents.translator`) |
| `instructions` | Yes | System prompt for this agent |
| `toolDescription` | Yes | What the operator sees when deciding to delegate |
| `inputSchema` | Yes | Zod schema defining what input this agent accepts |
| `inputField` | No | Which schema field contains the main prompt (default: first field) |
| `getTools` | No | Override which tools this agent can use |

### Controlling sub-agent tools

By default, sub-agents get all tools available to their name. To customize:

```typescript
export default defineSubagent({
  // ... other fields ...
  
  // Give this agent specific tools only
  getTools: (config) => {
    return createToolsForAgent("translator", config.tools ?? {});
  },
  
  // Or give it no tools at all (useful for search-enabled models)
  // getTools: () => ({}),
});
```

---

## Tools

Tools give your AI agents new capabilities. Want to check the weather? Query a database? Post to Twitter? Create a tool.

### Creating a tool

**1. Create the file**

Create `src/tools/weather.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { defineTool } from "../core/registries/tools";

export default defineTool({
  name: "weather",
  
  factory: (config) => ({
    name: "weather",
    
    tool: tool({
      description: "Get current weather for a location",
      
      inputSchema: z.object({
        location: z.string().describe("City name or coordinates"),
      }),
      
      execute: async ({ location }) => {
        // Your implementation here
        const apiKey = (config as { apiKey?: string })?.apiKey;
        const response = await fetch(
          `https://api.weather.com/v1/current?location=${location}&key=${apiKey}`
        );
        const data = await response.json();
        return `Weather in ${location}: ${data.temperature}°, ${data.conditions}`;
      },
    }),
    
    // Optional: restrict to specific agents
    // agents: ["operator", "research"],
  }),
});
```

**2. Add to config**

Edit `config.jsonc`:

```jsonc
"tools": {
  "weather": {
    "apiKey": "your-weather-api-key"
  }
}
```

**3. Done!**

Restart Pandora. All agents can now check the weather.

### Tool options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (matches config key in `ai.tools`) |
| `factory` | Yes | Function that creates the tool (receives config) |

The factory returns:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Tool name for logging |
| `tool` | Yes | The AI SDK tool instance |
| `agents` | No | List of agents that can use this tool. Omit for all agents. |

### Restricting tools to specific agents

```typescript
factory: (config) => ({
  name: "codeExecution",
  tool: tool({ /* ... */ }),
  
  // Only the coder agent can run code
  agents: ["coder"],
}),
```

---

## Channels

Channels connect Pandora to messaging platforms. Want Discord? Slack? A web interface? Create a channel.

### Creating a channel

Channels are more complex than other extensions because they handle real-time messaging.

**1. Create the folder**

Create `src/channels/discord/index.ts`:

```typescript
import { 
  defineChannel, 
  isOwner,
  type Channel, 
  type ChannelCapabilities 
} from "../../core/registries/channels";
import type { Gateway } from "../../core/gateway";
import type { Message } from "../../core/types";

// Your Discord client library
import { Client, GatewayIntentBits } from "discord.js";

interface DiscordConfig {
  enabled: boolean;
  ownerId: string;
  token: string;
}

const DISCORD_CAPABILITIES: ChannelCapabilities = {
  markdown: true,
  html: false,
  maxLength: 2000,
  supportedMedia: ["image", "file"],
};

class DiscordChannel implements Channel {
  private client: Client;
  private config: DiscordConfig;
  private gateway: Gateway;

  constructor(config: DiscordConfig, gateway: Gateway) {
    this.config = config;
    this.gateway = gateway;
    this.client = new Client({ 
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
    });
  }

  async start(): Promise<void> {
    this.client.on("messageCreate", async (msg) => {
      // Ignore bots and non-owners
      if (msg.author.bot) return;
      if (!isOwner(msg.author.id, this.config.ownerId)) return;

      // Build message for gateway
      const message: Message = {
        id: msg.id,
        conversationId: msg.channelId,
        userId: msg.author.id,
        text: msg.content,
        timestamp: msg.createdAt,
      };

      // Process through gateway
      const response = await this.gateway.handleMessage(
        message,
        DISCORD_CAPABILITIES
      );

      // Send response
      await msg.reply(response);
    });

    await this.client.login(this.config.token);
    console.log("Discord channel started");
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }
}

// Self-register this channel
export default defineChannel({
  name: "discord",
  configKey: "discord",
  create: (config, gateway) => new DiscordChannel(config as DiscordConfig, gateway),
});
```

**2. Add to config**

```jsonc
"channels": {
  "discord": {
    "enabled": true,
    "token": "your-discord-bot-token",
    "ownerId": "your-discord-user-id"
  }
}
```

**3. Install dependencies**

```bash
bun add discord.js
```

### Channel interface

Your channel class must implement:

| Method | Description |
|--------|-------------|
| `start()` | Connect to the platform and start listening for messages |
| `stop()` | Disconnect gracefully |

### Channel capabilities

Tell the AI what formatting this platform supports:

```typescript
const capabilities: ChannelCapabilities = {
  markdown: true,        // Supports **bold**, *italic*, etc.
  html: false,           // Supports <b>, <i>, etc.
  maxLength: 2000,       // Max message length (for chunking)
  supportedMedia: ["image", "file", "voice"],  // What attachments work
};
```

---

## Storage backends

Storage backends persist conversation history. Want to use Postgres? Redis? DynamoDB? Create a backend.

### Creating a storage backend

**1. Create the file**

Create `src/store/postgres.ts`:

```typescript
import { defineStore, type IMessageStore } from "../core/registries/store";
import type { ChatMessage } from "../core/types";
import { Pool } from "pg";

interface PostgresConfig {
  type: string;
  connectionString: string;
}

class PostgresStore implements IMessageStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async addMessage(conversationId: string, message: ChatMessage): Promise<void> {
    await this.pool.query(
      "INSERT INTO messages (conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4)",
      [conversationId, message.role, message.content, new Date()]
    );
  }

  async getHistory(conversationId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query(
      "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at",
      [conversationId]
    );
    return result.rows;
  }

  async clearHistory(conversationId: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM messages WHERE conversation_id = $1",
      [conversationId]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Self-register this storage backend
export default defineStore({
  type: "postgres",
  create: (config) => new PostgresStore((config as PostgresConfig).connectionString),
});
```

**2. Add to config**

```jsonc
"storage": {
  "type": "postgres",
  "connectionString": "postgresql://user:pass@localhost:5432/pandora"
}
```

**3. Install dependencies**

```bash
bun add pg
```

### Storage interface

Your store class must implement:

| Method | Description |
|--------|-------------|
| `addMessage(conversationId, message)` | Save a message to history |
| `getHistory(conversationId)` | Get all messages for a conversation |
| `clearHistory(conversationId)` | Delete all messages for a conversation |
| `close()` | Clean up connections |

---

## File naming conventions

| Convention | Effect |
|------------|--------|
| Files starting with `_` | Excluded from auto-discovery (use for helpers) |
| `index.ts` in channels | Entry point for channel directories |
| Any `.ts` file elsewhere | Auto-discovered and loaded |

## Project structure

```
src/
├── core/                  # Framework internals (don't modify)
│   ├── index.ts           # Entry point
│   ├── registries/        # Extension registries
│   ├── loader.ts          # Auto-discovery
│   └── ...
├── subagents/             # Your sub-agents
│   ├── coder.ts
│   ├── research.ts
│   ├── web-search-native.ts
│   ├── web-search-tool.ts
│   └── translator.ts      # Your custom agent
├── channels/              # Your channels
│   └── telegram/
│       └── index.ts
├── tools/                 # Your tools
│   ├── datetime.ts
│   ├── tavily-search.ts
│   └── weather.ts         # Your custom tool
└── store/                 # Your storage backends
    ├── memory.ts
    ├── sqlite.ts
    └── postgres.ts        # Your custom backend
```

## Tips

- **Start simple** — Begin with the built-in components and add customizations as needed
- **Check the examples** — Look at existing tools/agents for patterns to follow
- **Use TypeScript** — You get autocomplete and type checking for free
- **Test incrementally** — Add one thing at a time and verify it works
