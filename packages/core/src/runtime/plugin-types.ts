import type { ConfigFieldDescriptor } from '@pandorakit/sdk'
import { z } from 'zod'

/**
 * Schema version for all plugin descriptors (tools, storage, channels).
 * Bump this when the plugin interface changes in a breaking way.
 */
export const PLUGIN_SCHEMA_VERSION = 1

/** Build a Zod schema from config field descriptors */
export function buildSchemaFromFields(fields: ConfigFieldDescriptor[]): z.ZodObject {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    let fieldSchema: z.ZodTypeAny
    switch (field.type) {
      case 'number':
        fieldSchema = z.number()
        break
      case 'enum': {
        const [first, ...rest] = (field.options ?? []).map((o) => o.value)
        fieldSchema = first !== undefined ? z.enum([first, ...rest]) : z.string()
        break
      }
      default:
        fieldSchema = z.string()
        break
    }
    if (!field.required) {
      fieldSchema = fieldSchema.optional()
    }
    shape[field.key] = fieldSchema
  }
  return z.object(shape)
}
