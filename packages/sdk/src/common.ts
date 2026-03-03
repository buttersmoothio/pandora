/** Minimal structured logger interface. */
export interface Logger {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/** A diagnostic alert produced at plugin load time. */
export interface Alert {
  level: 'info' | 'warning'
  message: string
}

/** Describes a config field for UI rendering. */
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

/** Describes an environment variable a plugin depends on. */
export interface EnvVarDescriptor {
  /** Environment variable name, e.g. 'OPENWEATHER_API_KEY' */
  name: string
  /** Whether this variable is required. Defaults to `true` (omit for required vars). */
  required?: boolean
}

/** Per-plugin user configuration (shared shape for all plugin types). */
export interface PluginConfig {
  enabled: boolean
  /** Per-tool approval overrides (toolId → requires approval). */
  requireApproval?: Record<string, boolean>
  /** Per-agent configuration overrides. */
  agents?: Record<string, { model?: { provider: string; model: string } } & Record<string, unknown>>
  [key: string]: unknown
}

/** Context passed to a plugin's resolveTools hook. */
export interface ResolveToolsContext {
  /** The plugin's own validated config. */
  pluginConfig: PluginConfig
  /** Environment variables. */
  env: Record<string, string | undefined>
}
