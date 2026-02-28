import { loadChannels, startRealtimeChannels } from './src/channels'
import { getConfig } from './src/config'
import app from './src/index'
import { getMastra } from './src/mastra'
import { getStorage } from './src/storage'

const port = Number(process.env.PORT) || 4111

console.log(`🚀 Pandora server starting on http://localhost:${port}`)

// Start realtime channels (e.g. Telegram long-polling) after server is ready
async function startChannels() {
  try {
    const envVars = process.env as Record<string, string | undefined>
    const { config: configStore } = await getStorage(envVars)
    const config = await getConfig(configStore)
    await loadChannels(envVars, config.plugins)
    const mastra = await getMastra(envVars)
    await startRealtimeChannels(mastra, envVars)
  } catch (err) {
    console.error('Failed to start realtime channels:', err)
  }
}

startChannels()

export default {
  port,
  fetch: app.fetch,
}
