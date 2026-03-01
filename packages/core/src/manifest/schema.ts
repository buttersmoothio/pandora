import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared sub-schemas (reuse existing descriptor shapes from plugin-types.ts)
// ---------------------------------------------------------------------------

const envVarDescriptorSchema = z.object({
  name: z.string(),
  required: z.boolean().optional(),
})

const configFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})

const configFieldDescriptorSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'password', 'enum']),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  options: z.array(configFieldOptionSchema).optional(),
})

// ---------------------------------------------------------------------------
// Tool permissions (matches ToolPermissions from tools/types.ts)
// ---------------------------------------------------------------------------

const toolPermissionsSchema = z.object({
  time: z.boolean().optional(),
  network: z.array(z.string()).optional(),
  env: z.array(z.string()).optional(),
  fs: z.array(z.string()).optional(),
  random: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Provides entry — a single capability entry point
// ---------------------------------------------------------------------------

const providesEntrySchema = z.object({
  entry: z.string(),
  sandbox: z.enum(['compartment', 'host']).optional(),
  permissions: toolPermissionsSchema.optional(),
  requireApproval: z.boolean().optional(),
})

const agentProvidesEntrySchema = z.object({
  entry: z.string(),
  useTools: z.array(z.string()).optional(),
  modelTools: z.array(z.string()).optional(),
})

/** A single provides entry or an array of entries. */
const providesValueSchema = z.union([providesEntrySchema, z.array(providesEntrySchema)])

/** A single agent provides entry or an array of them. */
const agentProvidesValueSchema = z.union([
  agentProvidesEntrySchema,
  z.array(agentProvidesEntrySchema),
])

// ---------------------------------------------------------------------------
// Full manifest schema
// ---------------------------------------------------------------------------

export const pluginManifestSchema = z
  .object({
    $schema: z.string().optional(),
    manifestVersion: z.literal(1),
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    icon: z.string().optional(),
    version: z.string().optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    pandora: z.string().regex(/^[><=~^]/, 'Must be a semver range (e.g., ">=0.0.1")'),
    provides: z.object({
      tools: providesValueSchema.optional(),
      agents: agentProvidesValueSchema.optional(),
      channels: providesValueSchema.optional(),
    }),
    envVars: z.array(envVarDescriptorSchema).optional(),
    configFields: z.array(configFieldDescriptorSchema).optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type ProvidesEntry = z.infer<typeof providesEntrySchema>
export type AgentProvidesEntry = z.infer<typeof agentProvidesEntrySchema>

/** The capability keys a manifest can provide. */
export type ProvidesKey = keyof PluginManifest['provides']

/** Normalize a provides value (single or array) into an array. */
export function normalizeProvidesEntries(
  value: z.infer<typeof providesValueSchema> | z.infer<typeof agentProvidesValueSchema> | undefined,
): ProvidesEntry[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}
