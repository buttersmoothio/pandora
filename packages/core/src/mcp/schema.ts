import { z } from 'zod'

export const McpServerSchema = z
  .object({
    /** Stdio transport: command to execute */
    command: z.string().optional(),
    /** Stdio transport: arguments to the command */
    args: z.array(z.string()).optional(),
    /** HTTP/SSE transport: server URL */
    url: z.string().url().optional(),
    /** Whether this server is enabled */
    enabled: z.boolean().default(true),
    /** Display name for the server */
    name: z.string().optional(),
    /** Environment variable names to forward to the server process */
    env: z.array(z.string()).optional(),
    /** Whether tool calls require user approval (default: true) */
    requireApproval: z.boolean().default(true),
  })
  .refine((s) => s.command || s.url, {
    message: 'Either command or url is required',
  })
