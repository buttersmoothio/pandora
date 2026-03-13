import app from './src/index'
import { getLogger } from './src/logger'
import { getCachedRuntime } from './src/routes/helpers'

const port: number = Number(process.env.PORT) || 4111
const log: ReturnType<typeof getLogger> = getLogger()

log.info(`Pandora server starting on http://localhost:${port}`)

// Runtime initialization (including realtime channels) happens automatically
// via the runtime middleware on the first request.

async function shutdown(): Promise<void> {
  log.info('Shutting down…')
  const runtime = getCachedRuntime()
  if (runtime) {
    await runtime.close()
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 255,
}
