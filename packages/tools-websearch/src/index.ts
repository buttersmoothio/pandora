import { resolveSearchTools } from './resolve'

export type { SearchToolsResult } from './resolve'
export { loadBackend, loadFirstAvailable, resolveSearchTools } from './resolve'

export const tools: [] = []

export async function getTools({
  model,
  pluginConfig,
  env,
}: {
  model: string
  pluginConfig: Record<string, unknown>
  env: Record<string, string | undefined>
}) {
  const preferred = pluginConfig?.searchBackend as string | undefined
  const result = await resolveSearchTools({ model, preferred, env })
  return { tools: result.tools ?? {}, alerts: result.alerts }
}
