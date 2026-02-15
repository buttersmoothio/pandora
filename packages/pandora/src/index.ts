import 'ses'

// SES lockdown - must run before any other code
lockdown()

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import pkg from '../package.json'
import { getRuntimeKey, isServerless } from './env'

// Create Hono app
const app = new Hono()

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

// Config endpoint - placeholder
app.get('/api/config', (c) => {
  return c.json({
    message: 'Config endpoint - not yet implemented',
    todo: ['Load agent config', 'Return channel definitions'],
  })
})

// Telegram webhook - placeholder
app.post('/wh/telegram', async (c) => {
  return c.json({
    message: 'Telegram webhook - not yet implemented',
    todo: ['Verify webhook secret', 'Parse Telegram update', 'Route to agent'],
  })
})

// Cron endpoint - placeholder
app.post('/api/cron/:taskId', async (c) => {
  const taskId = c.req.param('taskId')
  return c.json({
    message: 'Cron endpoint - not yet implemented',
    taskId,
    todo: ['Authenticate request', 'Execute scheduled task'],
  })
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
