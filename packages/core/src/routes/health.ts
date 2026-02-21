import { Hono } from 'hono'
import pkg from '../../package.json'
import { extractBearerToken } from '../auth/routes'
import { getRuntimeKey, isServerless } from '../env'
import { getStorage } from '../storage'
import type { Env } from './helpers'

const healthRoutes = new Hono<Env>()

// Health check - returns runtime info + auth state
healthRoutes.get('/', async (c) => {
  let authState = { setup: false, authenticated: false }
  try {
    const { auth: authStore } = await getStorage(c.var.envVars, c.env)
    const credential = await authStore.getCredential()
    const isSetup = !!credential

    let authenticated = false
    if (isSetup) {
      const token = extractBearerToken(c)
      if (token) {
        const { verifySessionToken } = await import('../auth/session')
        const session = await verifySessionToken(authStore, token)
        authenticated = !!session
      }
    }

    authState = { setup: isSetup, authenticated }
  } catch {
    // If storage fails, return default auth state
  }

  return c.json({
    name: 'Pandora',
    version: pkg.version,
    runtime: getRuntimeKey(),
    serverless: isServerless(),
    auth: authState,
  })
})

export { healthRoutes }
