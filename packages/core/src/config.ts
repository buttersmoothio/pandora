/**
 * Configuration loader with JSONC (JSON with Comments) parsing and Zod validation
 *
 * The schema is intentionally permissive for dynamic sections (agents, channels, storage)
 * to allow user-defined extensions without modifying this file.
 */

import { resolve, dirname } from "node:path";
import { parse } from "jsonc-parser";
import { z } from "zod";
import { logger } from "./logger";

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
  temperature: z.number().min(0).max(2).optional().describe("Controls randomness (0 = almost deterministic, higher = more random)"),
  maxOutputTokens: z.number().positive().optional().describe("Maximum number of tokens to generate"),
  maxSteps: z.number().positive().optional().describe("Maximum tool loop steps (default: 20)"),
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
 * Schema for base channel configuration.
 * A channel is enabled by being present in the config.
 */
const baseChannelConfigSchema = z.object({}).passthrough(); // Allow channel-specific fields

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
 * Schema for memory configuration.
 * Enables persistent vector-based memory (episodic + semantic).
 */
const memoryConfigSchema = z.object({
  type: z.string().default("sqlite"),
  path: z.string().default("data/memory.db"),
  embeddingModel: z.string().default("openai/text-embedding-3-small"),
}).passthrough(); // Allow additional provider-specific fields

/**
 * Schema for scheduler configuration.
 * Enables scheduled tasks (reminders, recurring tasks, etc.).
 */
const schedulerConfigSchema = z.object({
  /** Whether the scheduler is enabled (default: true when scheduler config present) */
  enabled: z.boolean().default(true),
  /** Scheduler backend type (default: "simple" - setInterval-based) */
  type: z.string().default("simple"),
  /** Poll interval in ms for checking tasks (default: 10000ms) */
  pollInterval: z.number().min(1000).default(10_000),
}).passthrough(); // Allow additional scheduler-specific fields

/**
 * Full configuration schema
 */
const configSchema = z.object({
  personality: z.string().min(1, "Personality file path is required"),
  ai: aiConfigSchema,
  channels: channelsConfigSchema,
  storage: storageConfigSchema.optional().default({ type: "sqlite", path: "data/pandora.db" }),
  memory: memoryConfigSchema.optional(),
  scheduler: schedulerConfigSchema.optional(),
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
/** Base channel config (presence in config = enabled). Channel-specific fields via passthrough. */
export type ChannelConfig = z.infer<typeof baseChannelConfigSchema>;
/** Storage config: type, path, plus backend-specific fields. */
export type StorageConfig = z.infer<typeof storageConfigSchema>;
/** Memory config: type, path, embeddingModel, plus apiKey (injected at runtime). */
export type MemoryConfig = z.infer<typeof memoryConfigSchema> & { apiKey?: string };
/** Scheduler config: type, pollInterval, etc. */
export type SchedulerConfig = z.infer<typeof schedulerConfigSchema>;
/** Log level: `"normal"` (metadata only) or `"verbose"` (includes model prompts/responses). */
export type LogLevel = z.infer<typeof logLevelSchema>;

// Channel-specific config types
export type TelegramConfig = ChannelConfig & { token: string; ownerId: string };

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
  logger.debug("Config", "Loading configuration", { path: configPath });
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

  // Resolve and load personality file
  const personalityPath = resolve(dirname(configPath), result.data.personality);
  const personalityFile = Bun.file(personalityPath);

  if (!(await personalityFile.exists())) {
    throw new Error(`Personality file not found: ${personalityPath}`);
  }

  const personalityContent = (await personalityFile.text()).trim();

  if (!personalityContent) {
    throw new Error(`Personality file is empty: ${personalityPath}`);
  }

  result.data.personality = personalityContent;
  logger.debug("Config", "Personality loaded", { path: personalityPath });

  // Resolve storage and memory paths relative to the config file directory
  const configDir = dirname(configPath);
  if (result.data.storage?.path) {
    result.data.storage.path = resolve(configDir, result.data.storage.path);
  }
  if (result.data.memory?.path) {
    result.data.memory.path = resolve(configDir, result.data.memory.path);
  }

  logger.debug("Config", "Configuration loaded successfully");
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

  logger.debug("Config", "Configuration validated successfully");
}
