import { resolveSearchTool } from './resolve'

export type { SearchToolResult } from './resolve'
export { loadBackend, loadFirstAvailable, resolveSearchTool } from './resolve'

export const tools: [] = []

export async function resolveTools({
  pluginConfig,
  env,
}: {
  pluginConfig: Record<string, unknown>
  env: Record<string, string | undefined>
}) {
  const preferred = pluginConfig?.searchBackend as string | undefined
  const result = resolveSearchTool({ preferred, env })
  return { tools: result.tool ? [result.tool] : [], alerts: result.alerts }
}
