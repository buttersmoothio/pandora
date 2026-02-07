# Web Search Guide

Pandora offers two approaches to web search, giving you flexibility to choose based on your needs.

## Quick start

**Option 1: Native search** — Use a model with built-in search (simplest)

```jsonc
"agents": {
  "webSearchNative": { "model": "perplexity/sonar-pro" }
}
```

**Option 2: Tool-based search** — Use any model with a search API

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "your-tavily-key" }
},
"agents": {
  "webSearchTool": {
    "model": "anthropic/claude-sonnet-4.5",
    "searchBackend": "tavilySearch"
  }
}
```

## Choosing an approach

| Feature | Native Search | Tool-based Search |
|---------|---------------|-------------------|
| **Setup** | Just set the model | Configure tool + set searchBackend |
| **Model choice** | Limited to search-enabled models | Any model works |
| **Extra API cost** | None (included in model) | Search API costs apply |
| **Speed** | Faster (single call) | Slightly slower (search → process) |
| **Control** | Less (model handles search) | More (can customize) |

**Use native search when:**
- You want the simplest setup
- Speed is important
- You're okay with Perplexity, OpenAI search, or Gemini models

**Use tool-based search when:**
- You want to use a specific model (Claude, GPT-4o, etc.)
- You need control over search behavior
- You want to choose your search provider

---

## Native Search (`webSearchNative`)

Uses models that have web search built directly into them. The model handles everything — you just ask questions and get answers grounded in current web data.

### Configuration

```jsonc
"agents": {
  "webSearchNative": {
    "model": "perplexity/sonar-pro"
  }
}
```

### Supported models

| Model | Provider | Notes |
|-------|----------|-------|
| `perplexity/sonar-pro` | Perplexity | Best quality, comprehensive answers with citations |
| `perplexity/sonar` | Perplexity | Faster, good for simpler queries |
| `openai/gpt-4o-mini-search-preview` | OpenAI | OpenAI's search preview model |
| `google/gemini-2.0-flash` | Google | Uses Google Search for grounding |

### How it works

```
User Question → Search-enabled Model → Answer with citations
                    (handles search internally)
```

The model automatically:
1. Determines what to search for
2. Searches the web
3. Synthesizes results into an answer
4. Provides source citations

### Example

```
User: "What were the major tech announcements this week?"

webSearchNative (perplexity/sonar-pro):
  Based on my search, here are this week's major tech announcements:
  
  1. **Apple** announced... [source: techcrunch.com]
  2. **Google** released... [source: blog.google]
  ...
```

---

## Tool-based Search (`webSearchTool`)

Uses an external search API with any model you choose. The model calls the search tool, processes results, and generates an answer.

### Configuration

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "your-api-key" }
},
"agents": {
  "webSearchTool": {
    "model": "anthropic/claude-sonnet-4.5",
    "searchBackend": "tavilySearch"
  }
}
```

Two parts:
1. **Tool config** (`ai.tools`) — Configure the search API with credentials
2. **Agent config** (`ai.agents.webSearchTool`) — Set the model and which backend to use

### Available search backends

#### Tavily (`tavilySearch`)

AI-powered search optimized for LLM applications. Great for general web search.

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "tvly-..." }
}
```

- **Get API key:** [tavily.com](https://tavily.com/)
- **Pricing:** Free tier available, then usage-based
- **Best for:** General web search, news, current events

#### Exa (`exaSearch`)

Advanced semantic search with content extraction. Finds conceptually similar content.

```jsonc
"tools": {
  "exaSearch": { "apiKey": "exa-..." }
}
```

- **Get API key:** [dashboard.exa.ai](https://dashboard.exa.ai/api-keys)
- **Pricing:** Free tier available, then usage-based
- **Best for:** Research, finding similar content, technical searches

#### Perplexity Search (`perplexitySearch`)

Perplexity's search API (different from Sonar models). Real-time search with filtering.

```jsonc
"tools": {
  "perplexitySearch": { "apiKey": "pplx-..." }
}
```

- **Get API key:** [perplexity.ai/account/api/keys](https://www.perplexity.ai/account/api/keys)
- **Pricing:** Usage-based
- **Best for:** Real-time information, filtered searches

### How it works

```
User Question → Model → Search Tool → Search Results → Model → Answer
                  ↑                                       ↑
            (decides to search)                    (synthesizes answer)
```

1. Model receives the question
2. Model decides to call the search tool
3. Search tool queries the external API
4. Results return to the model
5. Model synthesizes an answer with citations

### Example

```
User: "What's the current price of Bitcoin?"

webSearchTool (claude-sonnet-4.5 + tavilySearch):
  [Calls tavilySearch with "current Bitcoin price"]
  [Receives results from Tavily API]
  
  Based on my search, Bitcoin is currently trading at $XX,XXX.
  [source: coinmarketcap.com, updated 2 minutes ago]
```

---

## Comparing search backends

| Backend | Strengths | Best for |
|---------|-----------|----------|
| **Tavily** | Fast, AI-optimized, good general results | News, current events, general queries |
| **Exa** | Semantic understanding, content extraction | Research, finding related content |
| **Perplexity** | Real-time, filtering options | Time-sensitive queries, filtered searches |

All three work well for most use cases. If unsure, start with **Tavily** — it has a generous free tier and works great for general searches.

---

## Full configuration examples

### Native search only

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-gateway-key" },
    "agents": {
      "operator": { "model": "anthropic/claude-sonnet-4.5" },
      "webSearchNative": { "model": "perplexity/sonar-pro" }
    }
  }
}
```

### Tool-based search with Tavily

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-gateway-key" },
    "tools": {
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

### Tool-based search with Exa

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-gateway-key" },
    "tools": {
      "exaSearch": { "apiKey": "exa-your-key" }
    },
    "agents": {
      "operator": { "model": "anthropic/claude-sonnet-4.5" },
      "webSearchTool": {
        "model": "openai/gpt-4o",
        "searchBackend": "exaSearch"
      }
    }
  }
}
```

### Both approaches (native + tool-based)

You can enable both if you want the operator to choose:

```jsonc
{
  "ai": {
    "gateway": { "apiKey": "your-gateway-key" },
    "tools": {
      "tavilySearch": { "apiKey": "tvly-your-key" }
    },
    "agents": {
      "operator": { "model": "anthropic/claude-sonnet-4.5" },
      "webSearchNative": { "model": "perplexity/sonar-pro" },
      "webSearchTool": {
        "model": "anthropic/claude-sonnet-4.5",
        "searchBackend": "tavilySearch"
      }
    }
  }
}
```

---

## Troubleshooting

### "Unknown search backend"

The `searchBackend` value doesn't match a registered search tool.

```
webSearchTool: Unknown search backend 'tavily'. Available backends: tavilySearch, exaSearch, perplexitySearch
```

**Fix:** Use the exact tool name: `tavilySearch`, not `tavily`.

### "Search backend not configured"

The backend is specified but not set up in `ai.tools`.

```
webSearchTool: Search backend 'tavilySearch' is not configured in ai.tools.
```

**Fix:** Add the tool configuration:

```jsonc
"tools": {
  "tavilySearch": { "apiKey": "your-key" }
}
```

### "API key required"

Missing API key for the search tool.

```
tavilySearch tool requires 'apiKey' in config
```

**Fix:** Add your API key to the tool config.

### Search results seem outdated

Native search models may have different recency settings. For the most current information:
- Use `perplexity/sonar-pro` which prioritizes recent content
- Or use tool-based search which queries live APIs

### Model not finding information

If searches return poor results:
1. Try a different search backend
2. Check if your query is too specific or too vague
3. For native search, try a different model

---

## Adding a custom search backend

You can add your own search backend by creating a tool. See [Customization → Tools](CUSTOMIZATION.md#tools) for the full guide.

Basic structure:

```typescript
// src/tools/my-search.ts
import { defineTool } from "../core/registries/tools";
import { defineSearchTool } from "../core/registries/search-tools";

export default defineTool({
  name: "mySearch",
  factory: (config) => ({
    name: "mySearch",
    tool: createMySearchTool(config?.apiKey),
  }),
});

defineSearchTool({
  name: "mySearch",
  description: "My custom search backend",
  factory: (config) => createMySearchTool(config?.apiKey),
});
```

Then configure it:

```jsonc
"tools": {
  "mySearch": { "apiKey": "..." }
},
"agents": {
  "webSearchTool": {
    "model": "anthropic/claude-sonnet-4.5",
    "searchBackend": "mySearch"
  }
}
```
