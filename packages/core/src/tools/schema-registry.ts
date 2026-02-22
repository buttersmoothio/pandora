import type { z } from 'zod'

const registry = new Map<string, z.ZodObject>()

export function registerToolSchema(id: string, schema: z.ZodObject): void {
  registry.set(id, schema)
}

export function getToolSchema(id: string): z.ZodObject | undefined {
  return registry.get(id)
}

export function clearToolSchemaRegistry(): void {
  registry.clear()
}
