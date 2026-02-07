# Agents Guide

Pandora uses a multi-agent architecture where a main **operator** can delegate tasks to specialized **sub-agents**.

## Quick start

Minimal setup (operator only):

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" }
}
```

With specialists:

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "anthropic/claude-sonnet-4.5" },
  "research": { "model": "openai/gpt-4o" }
}
```

## How it works

```
User Message → Operator → Response
                  ↓
            (decides to delegate)
                  ↓
              Sub-agent → Back to Operator → Response
```

1. The **operator** receives all messages
2. It decides whether to handle directly or delegate
3. Sub-agents are specialists that handle specific types of tasks
4. Results flow back through the operator to the user

The operator acts like a project manager — it understands the request and routes it to the right specialist.

---

## Operator (required)

The main AI that handles all conversations. This is the only required agent.

### Configuration

```jsonc
"agents": {
  "operator": {
    "model": "anthropic/claude-sonnet-4.5"
  }
}
```

### What the operator does

- Handles general conversation
- Decides when to delegate to specialists
- Synthesizes responses from sub-agents
- Uses tools directly when needed

### Choosing an operator model

The operator needs to be capable enough to:
- Understand user intent
- Know when to delegate
- Coordinate multi-step tasks

**Recommended models:**
- `anthropic/claude-sonnet-4.5` — Great balance of capability and cost
- `openai/gpt-4o` — Strong general performance
- `google/gemini-2.0-flash` — Fast with good reasoning

**Not recommended for operator:**
- Very small models (may struggle with delegation decisions)
- Specialized models (may lack general reasoning)

---

## Coder Sub-agent

A specialist for programming tasks.

### Configuration

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "anthropic/claude-sonnet-4.5" }
}
```

### What the coder handles

- Writing new code
- Debugging existing code
- Code review and suggestions
- Explaining code concepts
- Refactoring and optimization

### When the operator delegates to coder

- "Write a Python function that..."
- "Debug this code..."
- "Review this pull request..."
- "How do I implement..."
- "Refactor this to be more efficient..."

### Choosing a coder model

The coder benefits from strong coding capabilities:

**Recommended:**
- `anthropic/claude-sonnet-4.5` — Excellent at code generation and debugging
- `openai/gpt-4o` — Strong coding with good explanations
- `anthropic/claude-opus-4` — Best for complex architectural decisions

**Cost-effective alternatives:**
- `anthropic/claude-haiku` — Good for simpler tasks
- `openai/gpt-4o-mini` — Fast and capable for basic coding

### Example interaction

```
User: "Write a function to validate email addresses"

Operator: (delegates to coder)

Coder: Here's an email validation function:
  
  function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
  
  This checks for:
  - No spaces
  - Exactly one @ symbol
  - At least one dot after @
  ...
```

---

## Research Sub-agent

A specialist for information gathering and explanations.

### Configuration

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "research": { "model": "openai/gpt-4o" }
}
```

### What research handles

- Answering factual questions
- Explaining concepts
- Summarizing topics
- Comparing options
- Providing background information

### When the operator delegates to research

- "Explain how..."
- "What is the difference between..."
- "Summarize..."
- "What are the pros and cons of..."
- "Tell me about..."

### Choosing a research model

Research benefits from broad knowledge:

**Recommended:**
- `openai/gpt-4o` — Broad knowledge, good at explanations
- `anthropic/claude-sonnet-4.5` — Strong reasoning and clarity
- `google/gemini-2.0-flash` — Fast with good knowledge base

### Example interaction

```
User: "What's the difference between REST and GraphQL?"

Operator: (delegates to research)

Research: REST and GraphQL are both API paradigms, but differ in key ways:
  
  **REST:**
  - Multiple endpoints for different resources
  - Fixed data structures per endpoint
  - Simpler to cache
  ...
  
  **GraphQL:**
  - Single endpoint
  - Client specifies exact data needed
  - More flexible queries
  ...
```

---

## Web Search Sub-agents

For live internet searches. See the dedicated [Web Search Guide](WEB-SEARCH.md).

**Quick summary:**

| Agent | Use case |
|-------|----------|
| `webSearchNative` | Fast search with Perplexity/OpenAI search models |
| `webSearchTool` | Flexible search with any model + Tavily/Exa/Perplexity API |

---

## Configuring multiple sub-agents

You can enable any combination:

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "anthropic/claude-sonnet-4.5" },
  "research": { "model": "openai/gpt-4o" },
  "webSearchNative": { "model": "perplexity/sonar-pro" }
}
```

### Tips for choosing models

| Strategy | Approach |
|----------|----------|
| **Same model everywhere** | Simplest; consistent behavior |
| **Best model per task** | Coder gets coding-optimized, research gets knowledge-optimized |
| **Cost optimization** | Expensive model for operator, cheaper for simple sub-agents |

### Example: Cost-optimized setup

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-sonnet-4.5" },
  "coder": { "model": "anthropic/claude-sonnet-4.5" },
  "research": { "model": "openai/gpt-4o-mini" }
}
```

### Example: Maximum capability

```jsonc
"agents": {
  "operator": { "model": "anthropic/claude-opus-4" },
  "coder": { "model": "anthropic/claude-opus-4" },
  "research": { "model": "openai/gpt-4o" },
  "webSearchNative": { "model": "perplexity/sonar-pro" }
}
```

---

## Do I need sub-agents?

**Start without them** if:
- You're just getting started
- Your use case is simple (general chat)
- You want to minimize complexity

**Add sub-agents** when:
- You frequently ask coding questions → add `coder`
- You need detailed explanations → add `research`
- You need current information → add `webSearchNative` or `webSearchTool`

The operator alone is quite capable. Sub-agents provide specialization for better results in specific domains.

---

## Creating custom sub-agents

Want a translator? A writing assistant? A data analyst?

See [Customization → Sub-agents](CUSTOMIZATION.md#sub-agents) for how to create your own specialists.

---

## Troubleshooting

### Sub-agent not being used

The operator decides when to delegate. If a sub-agent isn't being used:

1. **Check it's enabled** — Must be in `config.ai.agents`
2. **Be explicit** — "Use the coder to..." or "Research this topic..."
3. **Check logs** — Enable `"logLevel": "verbose"` to see delegation decisions

### Wrong sub-agent chosen

The operator makes judgment calls. You can:
- Be more explicit: "This is a coding question..."
- Adjust operator instructions (advanced, requires code changes)

### Sub-agent responses are slow

Each delegation adds latency. Options:
- Use faster models for sub-agents
- Handle simple tasks with operator only
- Consider if you need all the sub-agents you've enabled

### "No config found for subagent"

The sub-agent file exists but isn't configured:

```jsonc
"agents": {
  "operator": { "model": "..." },
  "missingAgent": { "model": "..." }  // Add this
}
```
