import 'ses'

// SES lockdown - must run before any other code
// Check if already locked down (e.g., in test environment)
if (!Object.isFrozen(Object.prototype)) {
  lockdown({
    errorTaming: 'unsafe', // Preserve stack traces
    overrideTaming: 'severe', // Maximum compatibility with npm packages
    consoleTaming: 'unsafe', // Keep console for debugging
    stackFiltering: 'verbose',
  })
}

import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamText } from 'hono/streaming'
import pkg from '../package.json'
import { clearConfigCache, getConfig, resetConfig, updateConfig } from './config'
import { getRuntimeKey, isServerless } from './env'
import { clearMastraCache, getMastra } from './mastra'
import { getStorage } from './storage'

// Bindings type for Cloudflare Workers
type Bindings = {
  D1_DATABASE?: unknown
  [key: string]: unknown
}

// Create Hono app
const app = new Hono<{ Bindings: Bindings }>()

// Middleware
app.use('*', logger())
app.use('*', cors())

// Health check - returns runtime info
app.get('/', (c) => {
  return c.json({
    name: 'Pandora',
    version: pkg.version,
    runtime: getRuntimeKey(),
    serverless: isServerless(),
  })
})

/**
 * Helper to extract string env vars from raw env object
 */
function extractStringEnv(raw: Record<string, unknown>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value
    }
  }
  return result
}

const CHAT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pandora Chat</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a; color: #e4e4e7;
    height: 100dvh; display: flex; flex-direction: column;
  }
  header {
    padding: 12px 16px; border-bottom: 1px solid #27272a;
    font-weight: 600; font-size: 14px; color: #a1a1aa;
  }
  #messages {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .msg {
    max-width: 80%; padding: 10px 14px; border-radius: 12px;
    font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
  }
  .msg.user {
    align-self: flex-end; background: #2563eb; color: #fff;
  }
  .msg.assistant {
    align-self: flex-start; background: #27272a; color: #e4e4e7;
  }
  .msg.error {
    align-self: center; background: #7f1d1d; color: #fca5a5;
    font-size: 13px; border-radius: 8px;
  }
  #input-area {
    padding: 12px 16px; border-top: 1px solid #27272a;
    display: flex; gap: 8px;
  }
  #input {
    flex: 1; background: #18181b; color: #e4e4e7; border: 1px solid #3f3f46;
    border-radius: 8px; padding: 10px 12px; font-size: 14px;
    font-family: inherit; resize: none; outline: none;
    min-height: 42px; max-height: 160px;
  }
  #input:focus { border-color: #2563eb; }
  #send {
    background: #2563eb; color: #fff; border: none; border-radius: 8px;
    padding: 0 20px; font-size: 14px; font-weight: 500; cursor: pointer;
    white-space: nowrap;
  }
  #send:disabled { opacity: 0.5; cursor: not-allowed; }
  #send:hover:not(:disabled) { background: #1d4ed8; }
</style>
</head>
<body>
<header>Pandora Chat</header>
<div id="messages"></div>
<div id="input-area">
  <textarea id="input" rows="1" placeholder="Type a message\u2026"></textarea>
  <button id="send">Send</button>
</div>
<script>
(function() {
  const messages = []
  const msgEl = document.getElementById('messages')
  const input = document.getElementById('input')
  const sendBtn = document.getElementById('send')
  let sending = false

  function addBubble(role, text) {
    const div = document.createElement('div')
    div.className = 'msg ' + role
    div.textContent = text
    msgEl.appendChild(div)
    msgEl.scrollTop = msgEl.scrollHeight
    return div
  }

  function autoResize() {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 160) + 'px'
  }

  input.addEventListener('input', autoResize)

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  })

  sendBtn.addEventListener('click', send)

  async function send() {
    const text = input.value.trim()
    if (!text || sending) return
    sending = true
    sendBtn.disabled = true

    messages.push({ role: 'user', content: text })
    addBubble('user', text)
    input.value = ''
    autoResize()

    const bubble = addBubble('assistant', '')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice() })
      })
      if (!res.ok) {
        const err = await res.json().catch(function() { return { error: res.statusText } })
        throw new Error(err.error || 'Request failed')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        bubble.textContent = full
        msgEl.scrollTop = msgEl.scrollHeight
      }
      messages.push({ role: 'assistant', content: full })
    } catch (err) {
      messages.pop()
      bubble.remove()
      addBubble('error', err.message)
    } finally {
      sending = false
      sendBtn.disabled = false
      input.focus()
    }
  }

  input.focus()
})()
</script>
</body>
</html>`

// Chat UI
app.get('/chat', (c) => c.html(CHAT_HTML))

// Storage info endpoint
app.get('/api/storage', async (c) => {
  const envVars = extractStringEnv(env(c))
  const provider = envVars.STORAGE_PROVIDER ?? 'libsql'

  return c.json({
    provider,
    serverless: isServerless(),
  })
})

// Initialize storage endpoint (useful for testing)
app.post('/api/storage/init', async (c) => {
  try {
    const envVars = extractStringEnv(env(c))
    const { mastra } = await getStorage(envVars, c.env)
    return c.json({
      success: true,
      provider: envVars.STORAGE_PROVIDER ?? 'libsql',
      id: mastra.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ success: false, error: message }, 500)
  }
})

// Config endpoint - get current config
app.get('/api/config', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await getConfig(configStore, envVars)
  return c.json(config)
})

// Config endpoint - update config
app.patch('/api/config', async (c) => {
  try {
    const envVars = extractStringEnv(env(c))
    const { config: configStore } = await getStorage(envVars, c.env)
    const patch = await c.req.json()
    const updated = await updateConfig(configStore, patch)
    // Invalidate Mastra cache so next request rebuilds with new config
    clearConfigCache()
    clearMastraCache()
    return c.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid config'
    return c.json({ error: message }, 400)
  }
})

// Config endpoint - reset to defaults
app.delete('/api/config', async (c) => {
  const envVars = extractStringEnv(env(c))
  const { config: configStore } = await getStorage(envVars, c.env)
  const config = await resetConfig(configStore)
  return c.json(config)
})

// Telegram webhook - placeholder
app.post('/wh/telegram', async (c) => {
  const envVars = extractStringEnv(env(c))
  const mastra = await getMastra(envVars, c.env)
  const operator = mastra.getAgent('operator')
  return c.json({
    message: 'Telegram webhook - not yet implemented',
    agent: { id: operator.id, name: operator.name },
    todo: ['Verify webhook secret', 'Parse Telegram update', 'Route to agent'],
  })
})

// Cron endpoint - placeholder
app.post('/api/cron/:taskId', async (c) => {
  const taskId = c.req.param('taskId')
  const envVars = extractStringEnv(env(c))
  const mastra = await getMastra(envVars, c.env)
  const operator = mastra.getAgent('operator')
  return c.json({
    message: 'Cron endpoint - not yet implemented',
    taskId,
    agent: { id: operator.id, name: operator.name },
    todo: ['Authenticate request', 'Execute scheduled task'],
  })
})

// Chat endpoint - streaming LLM response
app.post('/api/chat', async (c) => {
  const body = await c.req.json<{ messages?: unknown }>()
  const { messages } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: 'messages must be a non-empty array' }, 400)
  }

  for (const msg of messages) {
    if (
      typeof msg !== 'object' ||
      msg === null ||
      !('role' in msg) ||
      !('content' in msg) ||
      !['user', 'assistant'].includes((msg as { role: string }).role) ||
      typeof (msg as { content: unknown }).content !== 'string'
    ) {
      return c.json(
        { error: 'Each message must have role ("user"|"assistant") and content (string)' },
        400,
      )
    }
  }

  try {
    const envVars = extractStringEnv(env(c))
    const mastra = await getMastra(envVars, c.env)
    const operator = mastra.getAgent('operator')
    const result = await operator.stream(messages as Parameters<typeof operator.stream>[0])

    return streamText(
      c,
      async (stream) => {
        for await (const chunk of result.textStream) {
          await stream.write(chunk)
        }
      },
      async (err, stream) => {
        await stream.write(`\n\n[Error: ${err.message}]`)
        await stream.close()
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.path }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
    },
    500,
  )
})

export default app
export { app }
