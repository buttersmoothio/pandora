import app from './src/index'

const port = Number(process.env.PORT) || 3000

console.log(`🚀 Pandora server starting on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
