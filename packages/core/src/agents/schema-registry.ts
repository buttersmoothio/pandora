import type { z } from 'zod'

const registry = new Map<string, z.ZodObject>()

export function registerAgentSchema(id: string, schema: z.ZodObject): void {
  registry.set(id, schema)
}

export function getAgentSchema(id: string): z.ZodObject | undefined {
  return registry.get(id)
}

export function clearAgentSchemaRegistry(): void {
  registry.clear()
}
