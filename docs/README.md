# Pandora Documentation

## Getting Started

| Guide | Description |
|-------|-------------|
| [**Configuration**](CONFIGURATION.md) | Complete reference for all settings |
| [**How Pandora Works**](HOW-IT-WORKS.md) | Architecture and concepts |

## Feature Guides

| Guide | Description |
|-------|-------------|
| [**Agents**](AGENTS.md) | Set up the operator and sub-agents (coder, research) |
| [**Tools**](TOOLS.md) | Enable tools like datetime and search |
| [**Web Search**](WEB-SEARCH.md) | Configure web search with native or tool-based approaches |
| [**Storage**](STORAGE.md) | Choose between SQLite and memory storage |
| [**Telegram Setup**](TELEGRAM.md) | Connect to Telegram |

## Extending Pandora

| Guide | Description |
|-------|-------------|
| [**Customization**](CUSTOMIZATION.md) | Create your own agents, tools, channels, and storage backends |

## Common tasks

### I want to change AI models

Edit `config.jsonc` and set the `model` field for any agent:

```jsonc
"agents": {
  "operator": { "model": "openai/gpt-4o" }
}
```

See [Configuration → AI Models](CONFIGURATION.md#ai-models) for the full list.

### I want to enable sub-agents

Sub-agents are specialists the main AI can delegate to:

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "anthropic/claude-sonnet-4.5" },
  "research": { "model": "openai/gpt-4o" }
}
```

See the [Agents Guide](AGENTS.md) for details on each agent.

### I want to add web search

**Option 1: Native search models** (faster, no extra API cost)

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "webSearchNative": { "model": "perplexity/sonar-pro" }
}
```

**Option 2: External search API** (works with any model)

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "your-tavily-api-key" }
},
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "webSearchTool": {
    "model": "anthropic/claude-sonnet-4.5",
    "searchBackend": "tavilySearch"
  }
}
```

See [Web Search Guide](WEB-SEARCH.md) for full details on all search backends.

### I want to use tools (datetime, etc.)

See the [Tools Guide](TOOLS.md) for available tools and how to enable them.

### I want to change storage settings

See the [Storage Guide](STORAGE.md) for SQLite vs memory options.

### I want to create my own tool

See [Customization → Tools](CUSTOMIZATION.md#tools).

### I want to add Discord or Slack

See [Customization → Channels](CUSTOMIZATION.md#channels).
