import { z } from 'zod'

/**
 * Schema version for all plugin descriptors (tools, storage, channels).
 * Bump this when the plugin interface changes in a breaking way.
 */
export const PLUGIN_SCHEMA_VERSION = 1

/** A diagnostic alert produced at plugin load time. */
export interface Alert {
  level: 'info' | 'warning'
  message: string
}

/** Result shape when `getTools` returns tools together with alerts. */
export interface GetToolsResultWithAlerts {
  tools: import('./tools/types').ToolRecord | null
  alerts?: Alert[]
}

/**
 * Normalize a `getTools` return value into `{ tools, alerts }`.
 *
 * Accepts either:
 * - a plain `ToolRecord | null`
 * - `{ tools, alerts? }`
 */
export function unwrapGetToolsResult(
  result: import('./tools/types').ToolRecord | null | GetToolsResultWithAlerts,
): { tools: import('./tools/types').ToolRecord | null; alerts: Alert[] } {
  if (result !== null && typeof result === 'object' && 'tools' in result) {
    const r = result as GetToolsResultWithAlerts
    return { tools: r.tools, alerts: r.alerts ?? [] }
  }
  return { tools: result as import('./tools/types').ToolRecord | null, alerts: [] }
}

/** Context passed to a plugin's getTools hook — shared by agent and tool plugins. */
export interface GetToolsContext {
  /** The resolved model string (e.g. 'openai/gpt-4o'). */
  model: string
  /** The plugin's own validated config. */
  pluginConfig: Record<string, unknown>
  /** Environment variables. */
  env: Record<string, string | undefined>
}

/** Describes a config field for UI rendering */
export interface ConfigFieldDescriptor {
  /** Field key in config object, e.g. 'ownerId' */
  key: string
  /** Human-readable label, e.g. 'Owner ID' */
  label: string
  /** Input type hint: `'enum'` renders a dropdown select from `options` */
  type: 'text' | 'number' | 'password' | 'enum'
  /** Whether this field is required */
  required?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Help text shown below the input */
  description?: string
  /** Allowed values for `type: 'enum'`. Each entry has a `value` and display `label`. */
  options?: { value: string; label: string }[]
}

/** Describes an environment variable a plugin depends on */
export interface EnvVarDescriptor {
  /** Environment variable name, e.g. 'OPENWEATHER_API_KEY' */
  name: string
  /** Whether this variable is required. Defaults to `true` (omit for required vars). */
  required?: boolean
}

/** Per-plugin user configuration (shared shape for all plugin types) */
export interface PluginConfig {
  enabled: boolean
  [key: string]: unknown
}

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
        const values = (field.options ?? []).map((o) => o.value)
        fieldSchema = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string()
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
