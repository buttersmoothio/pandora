import type { Tool } from '@mastra/core/tools'

/** A record of tool instances keyed by tool ID */
// biome-ignore lint/suspicious/noExplicitAny: Tool generics require `any` for covariant assignment
export type ToolRecord = Record<string, Tool<any, any, any, any, any, any>>
