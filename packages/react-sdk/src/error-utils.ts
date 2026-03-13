import { PandoraApiError } from '@pandorakit/sdk/client'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid password',
  setup_required: 'Please set up your password first',
  already_setup: 'Password has already been configured',
}

/** Map an API error to a user-friendly `Error` with a readable message. */
export function mapApiError(err: unknown): Error {
  if (err instanceof PandoraApiError) {
    try {
      const data = JSON.parse(err.body) as { error?: string }
      const code = data?.error ?? ''
      const message = ERROR_MESSAGES[code] ?? code ?? `Request failed (${err.status})`
      return new Error(message)
    } catch {
      return new Error(ERROR_MESSAGES[err.body] ?? err.body ?? `Request failed (${err.status})`)
    }
  }
  return err instanceof Error ? err : new Error('An unexpected error occurred')
}
