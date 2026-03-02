import type { ToolsInput } from '@mastra/core/agent'
import { getLogger } from '../logger'
import type { Alert } from '../plugin-types'

/** Supported model-native tool capability keys. */
export type ModelToolKey = 'search'

/**
 * Resolve model-native tools from provider SDKs.
 *
 * Maps capability keys to provider-specific tools:
 * - `'search'` + `openai/*` → `openai.tools.webSearch({})`
 * - `'search'` + `google/*` → `google.tools.googleSearch({})`
 * - `'search'` + `anthropic/*` → `anthropic.tools.webSearch_20250305()`
 * - `'search'` + `perplexity/*` → `{}` (model searches natively)
 * - `'search'` + unknown → `{}` (no-op)
 */
export async function resolveModelTools(
  modelString: string,
  requested: ModelToolKey[],
): Promise<{ tools: ToolsInput; alerts: Alert[] }> {
  const tools: ToolsInput = {}
  const alerts: Alert[] = []

  // Strip optional gateway prefix (e.g. "vercel/openai/gpt-4o" → "openai/gpt-4o")
  const provider = modelString.replace(/^vercel\//, '')

  const log = getLogger()

  for (const key of requested) {
    switch (key) {
      case 'search': {
        const result = await resolveNativeSearch(provider)
        if (result) {
          Object.assign(tools, result.tools)
          alerts.push({ level: 'info', message: result.message })
          log.debug('Model-native tool resolved', { key, message: result.message })
        } else {
          log.debug('Model-native tool not available', { key, provider })
        }
        break
      }
    }
  }

  return { tools, alerts }
}

async function resolveNativeSearch(
  provider: string,
): Promise<{ tools: ToolsInput; message: string } | null> {
  if (provider.startsWith('perplexity/')) {
    return { tools: {}, message: 'Using Perplexity built-in search' }
  }

  if (provider.startsWith('openai/')) {
    try {
      // @ts-expect-error — optional peer dependency
      const { openai } = await import('@ai-sdk/openai')
      return {
        tools: { native_search: openai.tools.webSearch({}) },
        message: 'Using OpenAI native search',
      }
    } catch {
      /* SDK not installed */
    }
  }

  if (provider.startsWith('google/')) {
    try {
      // @ts-expect-error — optional peer dependency
      const { google } = await import('@ai-sdk/google')
      return {
        tools: { google_search: google.tools.googleSearch({}) },
        message: 'Using Google native search',
      }
    } catch {
      /* SDK not installed */
    }
  }

  if (provider.startsWith('anthropic/')) {
    try {
      // @ts-expect-error — optional peer dependency
      const { anthropic } = await import('@ai-sdk/anthropic')
      return {
        tools: { native_search: anthropic.tools.webSearch_20250305() },
        message: 'Using Anthropic native search',
      }
    } catch {
      /* SDK not installed */
    }
  }

  return null
}
