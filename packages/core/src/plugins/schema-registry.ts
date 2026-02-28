import type { z } from 'zod'

const registry = new Map<string, z.ZodObject>()

export function registerPluginSchema(id: string, schema: z.ZodObject): void {
  registry.set(id, schema)
}

export function getPluginSchema(id: string): z.ZodObject | undefined {
  return registry.get(id)
}

export function removePluginSchema(id: string): void {
  registry.delete(id)
}

export function clearPluginSchemaRegistry(): void {
  registry.clear()
}
