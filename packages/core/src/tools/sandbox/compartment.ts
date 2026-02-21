import type { ToolPermissions } from '../types'
import { buildEndowments, MAX_OUTPUT_BYTES } from './endowments'

export interface CompartmentExecuteOptions {
  /**
   * The tool function body as a string.
   * Must evaluate to an async function: `async function(input) { ... }`
   */
  code: string
  /** Input data passed to the tool function. */
  input: unknown
  /** Declared permissions for endowment selection. */
  permissions: ToolPermissions
  /** Environment variables for scoped env access. */
  envVars: Record<string, string | undefined>
}

/**
 * Execute tool code inside an SES Compartment.
 *
 * The code string is evaluated as an expression that should be
 * an async function: `async function(input) { ... }`.
 *
 * The compartment receives only:
 * - Endowments matching the declared permissions
 * - A tamed console
 *
 * Output is JSON-serialized and deserialized to ensure only plain
 * data crosses the compartment boundary (strips prototypes).
 */
export async function executeInCompartment(opts: CompartmentExecuteOptions): Promise<unknown> {
  const { code, input, permissions, envVars } = opts

  const endowments = buildEndowments(permissions, envVars)

  const compartment = new Compartment({
    globals: harden({
      ...endowments,
      input: harden(input),
    }),
    __options__: true,
  })

  // Evaluate the code string — expects an async function expression
  const fn = compartment.evaluate(`(${code})`)

  if (typeof fn !== 'function') {
    throw new Error('Tool code must evaluate to a function')
  }

  // Execute with hardened input and await the result
  const rawOutput = await fn(harden(input))

  // Serialize/deserialize to strip compartment prototypes and ensure
  // only plain data crosses the boundary.
  // JSON.stringify returns undefined for undefined/function/symbol — normalize to null.
  const serialized = JSON.stringify(rawOutput) ?? 'null'

  if (serialized.length > MAX_OUTPUT_BYTES) {
    throw new Error(
      `Tool output exceeds maximum size (${MAX_OUTPUT_BYTES} bytes). Got ${serialized.length} bytes.`,
    )
  }

  return JSON.parse(serialized)
}
