import type { z } from 'zod'

const registry = new Map<string, z.ZodObject>()

export function registerChannelSchema(id: string, schema: z.ZodObject): void {
  registry.set(id, schema)
}

export function getChannelSchema(id: string): z.ZodObject | undefined {
  return registry.get(id)
}

export function clearChannelSchemaRegistry(): void {
  registry.clear()
}
