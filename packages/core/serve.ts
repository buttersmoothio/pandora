import app from './src/index'
import { getLogger } from './src/logger'

const port = Number(process.env.PORT) || 4111

getLogger().info(`Pandora server starting on http://localhost:${port}`)

// Runtime initialization (including realtime channels) happens automatically
// via the runtime middleware on the first request.

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255,
}
