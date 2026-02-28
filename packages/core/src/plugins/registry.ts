import type { ProvidesKey } from '../manifest/schema'
import type { ConfigFieldDescriptor, EnvVarDescriptor } from '../plugin-types'

export interface PluginRecord {
  id: string
  name: string
  description?: string
  author?: string
  icon?: string
  version?: string
  homepage?: string
  repository?: string
  license?: string
  envVars?: EnvVarDescriptor[]
  configFields?: ConfigFieldDescriptor[]
  provides: ProvidesKey[]
}

const registry = new Map<string, PluginRecord>()

export function registerPlugin(record: PluginRecord): void {
  registry.set(record.id, record)
}

export function getPlugin(id: string): PluginRecord | undefined {
  return registry.get(id)
}

export function getAllPlugins(): PluginRecord[] {
  return [...registry.values()]
}

export function clearPluginRegistry(): void {
  registry.clear()
}
