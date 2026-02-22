/**
 * Schema version for all plugin descriptors (tools, storage, channels).
 * Bump this when the plugin interface changes in a breaking way.
 */
export const PLUGIN_SCHEMA_VERSION = 1

/** Describes a config field for UI rendering */
export interface ConfigFieldDescriptor {
  /** Field key in config object, e.g. 'ownerId' */
  key: string
  /** Human-readable label, e.g. 'Owner ID' */
  label: string
  /** HTML input type hint */
  type: 'text' | 'number' | 'password'
  /** Whether this field is required */
  required?: boolean
  /** Placeholder text */
  placeholder?: string
  /** Help text shown below the input */
  description?: string
}
