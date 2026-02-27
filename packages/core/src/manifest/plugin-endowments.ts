import '../ses-lockdown'

import { buildEndowments, tamedConsole } from '../tools/sandbox/endowments'
import type { ToolPermissions } from '../tools/types'

/**
 * Build Compartment globals for a plugin package.
 *
 * Combines:
 * - Always-available web-platform globals (URL, TextEncoder, timers, etc.)
 * - Permission-gated capabilities (fetch, env, Date, etc.)
 */
export function buildPluginEndowments(
  permissions: ToolPermissions,
  envVars: Record<string, string | undefined>,
): Record<string, unknown> {
  const gated = buildEndowments(permissions, envVars)

  const globals: Record<string, unknown> = {
    // --- Always provided (safe web-platform APIs) ---
    console: tamedConsole,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    atob,
    btoa,
    queueMicrotask,
    AbortController,
    AbortSignal,

    // --- Permission-gated ---
    ...(gated.fetch && { fetch: gated.fetch }),
    ...(gated.env && { env: gated.env }),
    ...(gated.readFile && { readFile: gated.readFile }),
    ...(gated.Date && { Date: gated.Date }),
    ...(gated.Intl && { Intl: gated.Intl }),
    ...(gated.Math && { Math: gated.Math }),
  }

  return harden(globals)
}
