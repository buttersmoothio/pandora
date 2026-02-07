# Tools Guide

Tools give your AI agents extra capabilities beyond conversation — like getting the current time, searching the web, or calling external APIs.

## Quick start

Enable tools in `config.jsonc`:

```jsonc
"tools": {
  "datetime": {}
}
```

Tools are then available to all agents automatically.

## How tools work

```
User: "What time is it?"
         ↓
     Operator decides to use datetime tool
         ↓
     Tool returns: "Saturday, February 7, 2026 at 2:30 PM EST"
         ↓
     Operator: "It's currently 2:30 PM EST on Saturday, February 7th, 2026."
```

1. User asks a question
2. The AI decides if a tool would help
3. AI calls the tool with appropriate parameters
4. Tool returns data
5. AI incorporates the result into its response

The AI decides when to use tools — you don't need to explicitly ask.

---

## Available Tools

### datetime

Returns the current date and time.

**Configuration:**

```jsonc
"tools": {
  "datetime": {}
}
```

No API key required.

**What it provides:**
- Current date and time
- Day of week
- Timezone information

**Example uses:**
- "What time is it?"
- "What's today's date?"
- "What day of the week is it?"
- Scheduling and time-sensitive tasks

---

### Search backends

These tools provide web search capabilities for the `webSearchTool` agent:

| Tool | Description | API Key |
|------|-------------|---------|
| `tavilySearch` | AI-powered web search | [tavily.com](https://tavily.com/) |
| `exaSearch` | Semantic search with content extraction | [dashboard.exa.ai](https://dashboard.exa.ai/api-keys) |
| `perplexitySearch` | Real-time search with filtering | [perplexity.ai](https://www.perplexity.ai/account/api/keys) |

See the [Web Search Guide](WEB-SEARCH.md) for detailed setup instructions.

**Example configuration:**

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "tvly-your-key" }
}
```

---

## Full configuration example

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-gateway-key" },
    "tools": {
      "datetime": {},
      "tavilySearch": { "apiKey": "tvly-your-key" }
    },
    "agents": {
      "operator": { "model": "anthropic/claude-sonnet-4.5" },
      "webSearchTool": {
        "model": "anthropic/claude-sonnet-4.5",
        "searchBackend": "tavilySearch"
      }
    }
  }
}
```

---

## Tool availability

By default, tools are available to **all agents** (operator and sub-agents).

Some tools restrict themselves to specific agents. Tool authors can set this when creating tools.

For example, a code execution tool might only be available to the `coder` agent:

```typescript
// In the tool definition
agents: ["coder"]  // Only coder can use this
```

---

## Creating custom tools

Want to add weather, stock prices, or your own API integrations?

See [Customization → Tools](CUSTOMIZATION.md#tools) for a complete guide.

**Basic structure:**

```typescript
// src/tools/weather.ts
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
        location: z.string().describe("City name"),
      }),
      execute: async ({ location }) => {
        // Your implementation
        return `Weather in ${location}: 72°F, Sunny`;
      },
    }),
  }),
});
```

Then configure it:

```jsonc
"tools": {
  "weather": { "apiKey": "optional-if-needed" }
}
```

---

## Troubleshooting

### Tool not being used

The AI decides when tools are helpful. To encourage tool use:
- Ask questions the tool can answer: "What time is it?" for datetime
- Be explicit if needed: "Use the datetime tool to..."

### "Tool not configured"

The tool exists but isn't in your config:

```jsonc
"tools": {
  "datetime": {}  // Add the tool here
}
```

### "API key required"

Some tools need credentials:

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "your-actual-key" }
}
```

### Tool returning errors

Check:
1. API key is valid
2. Network connectivity (for external APIs)
3. Tool-specific requirements in the tool's documentation
