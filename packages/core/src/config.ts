/**
 * Configuration loader with JSONC (JSON with Comments) parsing and Zod validation
 *
 * The schema is intentionally permissive for dynamic sections (agents, channels, storage)
 * to allow user-defined extensions without modifying this file.
 */

import { parse } from "jsonc-parser";
import { z } from "zod";

/**
 * Schema for AI Gateway configuration
 */
const gatewayConfigSchema = z.object({
  apiKey: z.string().min(1, "AI Gateway API key is required"),
});

/**
 * Schema for agent configuration (applies to operator and all subagents)
 */
const agentConfigSchema = z.object({
  model: z.string().describe("Gateway model ID (e.g. anthropic/claude-sonnet-4.5, openai/gpt-4o)"),
  /** Search backend for webSearchTool agent (e.g. tavilySearch, exaSearch, perplexitySearch) */
  searchBackend: z.string().optional().describe("Search backend tool name for webSearchTool agent"),
});

/**
 * Schema for tool configuration (tool-specific settings like API keys)
 */
const toolConfigSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

/**
 * Schema for AI configuration with gateway, tools, and agents.
 * Agents uses catchall to allow any subagent name beyond the required operator.
 */
const aiConfigSchema = z.object({
  gateway: gatewayConfigSchema,
  tools: z.record(z.string(), toolConfigSchema).optional().default({}),
  agents: z
    .object({
      operator: agentConfigSchema, // Required - the main orchestrator
    })
    .catchall(agentConfigSchema.optional()), // Allow any additional subagents
});

/**
 * Schema for base channel configuration (all channels need at least enabled + ownerId)
 */
const baseChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  ownerId: z.string().min(1, "Owner ID is required for authentication"),
}).passthrough(); // Allow additional channel-specific fields

/**
 * Schema for channels configuration.
 * Uses record to allow any channel name.
 */
const channelsConfigSchema = z.record(z.string(), baseChannelConfigSchema.optional()).default({});

/**
 * Schema for storage configuration.
 * Type is a string to allow user-defined storage backends.
 */
const storageConfigSchema = z.object({
  type: z.string().default("sqlite"),
  path: z.string().default("data/pandora.db"),
}).passthrough(); // Allow additional storage-specific fields

/**
 * Schema for log level configuration
 *
 * - `"normal"` — default; logs metadata (message flow, tool calls, durations).
 * - `"verbose"` — additionally logs full model prompts and responses.
 */
const logLevelSchema = z.enum(["normal", "verbose"]).default("normal");

/**
 * Full configuration schema
 */
const configSchema = z.object({
  ai: aiConfigSchema,
  channels: channelsConfigSchema,
  storage: storageConfigSchema.optional().default({ type: "sqlite", path: "data/pandora.db" }),
  logLevel: logLevelSchema.optional().default("normal"),
});

/** Full config (ai, channels, storage). */
export type Config = z.infer<typeof configSchema>;
/** AI config: gateway, tools, and agents (operator required, others dynamic). */
export type AIConfig = z.infer<typeof aiConfigSchema>;
/** Single agent config: model. */
export type AgentConfig = z.infer<typeof agentConfigSchema>;
/** Tool-specific configuration (varies per tool). */
export type ToolConfig = z.infer<typeof toolConfigSchema>;
/** Base channel config: enabled, ownerId, plus channel-specific fields. */
export type ChannelConfig = z.infer<typeof baseChannelConfigSchema>;
/** Storage config: type, path, plus backend-specific fields. */
export type StorageConfig = z.infer<typeof storageConfigSchema>;
/** Log level: `"normal"` (metadata only) or `"verbose"` (includes model prompts/responses). */
export type LogLevel = z.infer<typeof logLevelSchema>;

// Legacy type alias for backward compatibility
export type TelegramConfig = ChannelConfig & { token: string };

/**
 * Load and validate configuration from a JSONC file.
 *
 * @param configPath - Path to the JSONC config file (default: `"config.jsonc"`).
 * @returns Parsed and validated config.
 * @throws {Error} If the file is missing or validation fails.
 */
export async function loadConfig(
  configPath: string = "../../config.jsonc"
): Promise<Config> {
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const content = await file.text();
  const rawConfig = parse(content);

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${String(e.path.join("."))}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}

/**
 * Validate configuration after loading.
 * Ensures gateway is configured and tools are known.
 *
 * @param config - Loaded config to validate.
 * @param availableToolNames - List of known tool names from the tool registry.
 * @throws {Error} If gateway is missing or tool is unknown.
 */
export function validateConfig(
  config: Config,
  availableToolNames: string[] = []
): void {
  const errors: string[] = [];

  // Operator is required by schema, but double-check
  if (!config.ai.agents.operator) {
    errors.push("Operator agent must be configured");
  }

  // Check gateway is configured
  if (!config.ai.gateway?.apiKey) {
    errors.push("AI Gateway API key is required");
  }

  // Check that each tool configured in ai.tools is a known tool
  for (const toolName of Object.keys(config.ai.tools)) {
    if (availableToolNames.length > 0 && !availableToolNames.includes(toolName)) {
      errors.push(
        `Tool '${toolName}' is configured in 'ai.tools' but is not a known tool`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
}
