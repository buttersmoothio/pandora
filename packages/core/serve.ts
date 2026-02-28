import app from './src/index'

const port = Number(process.env.PORT) || 4111

console.log(`🚀 Pandora server starting on http://localhost:${port}`)

// Runtime initialization (including realtime channels) happens automatically
// via the runtime middleware on the first request.

export default {
  port,
  fetch: app.fetch,
}
