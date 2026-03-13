import { Hono } from 'hono'
import { getLogger } from '../logger'
import type { Env } from './helpers'

export const mcpOAuthRoutes: Hono<Env> = new Hono<Env>()

/** OAuth callback for MCP servers — public (no auth middleware). */
mcpOAuthRoutes.get('/mcp/callback', async (c) => {
  const log = getLogger()
  const code = c.req.query('code')
  const state = c.req.query('state')

  if (!(code && state)) {
    return c.html('<h1>Error</h1><p>Missing code or state parameter.</p>', 400)
  }

  const runtime = c.var.runtime

  try {
    const serverId = await runtime.mcpManager?.handleOAuthCallback(code, state)

    // Trigger reload to reconnect MCP servers with new tokens
    await runtime.reload()

    // Redirect to UI if FRONTEND_URL is set, otherwise show success page
    const envVars = c.var.envVars
    if (envVars.FRONTEND_URL) {
      const redirectUrl = new URL('/plugins', envVars.FRONTEND_URL)
      redirectUrl.searchParams.set('oauth', 'success')
      if (serverId) {
        redirectUrl.searchParams.set('server', serverId)
      }
      return c.redirect(redirectUrl.toString())
    }

    return c.html(
      '<h1>Authorization Successful</h1><p>You can close this tab and return to Pandora.</p>',
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('[mcp] OAuth callback failed', { error: message })

    const envVars = c.var.envVars
    if (envVars.FRONTEND_URL) {
      const redirectUrl = new URL('/plugins', envVars.FRONTEND_URL)
      redirectUrl.searchParams.set('oauth', 'error')
      return c.redirect(redirectUrl.toString())
    }

    return c.html(`<h1>Authorization Failed</h1><p>${escapeHtml(message)}</p>`, 500)
  }
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
