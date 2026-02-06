/**
 * Configuration loader with JSONC (JSON with Comments) parsing and Zod validation
 */

import { parse } from "jsonc-parser";
import { z } from "zod";
import type { ProviderName } from "./providers";

/**
 * Schema for provider configuration (API key)
 */
const providerConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

/**
 * Schema for agent configuration
 */
const agentConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "minimax"]),
  model: z.string(),
  description: z.string().optional(),
});

/**
 * Schema for tool configuration (tool-specific settings like API keys)
 */
const toolConfigSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());

/**
 * Schema for AI configuration with providers, tools, and agents
 */
const aiConfigSchema = z.object({
  providers: z
    .object({
      openai: providerConfigSchema.optional(),
      anthropic: providerConfigSchema.optional(),
      minimax: providerConfigSchema.optional(),
    })
    .optional()
    .default({}),
  tools: z.record(z.string(), toolConfigSchema).optional().default({}),
  agents: z.object({
    operator: agentConfigSchema, // Required - the main orchestrator
    coder: agentConfigSchema.optional(),
    research: agentConfigSchema.optional(),
  }),
});

/**
 * Schema for Telegram channel configuration
 */
const telegramConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: z.string().min(1, "Telegram bot token is required"),
  ownerId: z.string().min(1, "Owner ID is required for authentication"),
});

/**
 * Schema for channels configuration
 */
const channelsConfigSchema = z.object({
  telegram: telegramConfigSchema.optional(),
});

/**
 * Schema for storage configuration
 */
const storageConfigSchema = z.object({
  type: z.enum(["memory", "sqlite"]).default("sqlite"),
  path: z.string().default("data/pandora.db"),
});

/**
 * Full configuration schema
 */
const configSchema = z.object({
  ai: aiConfigSchema,
  channels: channelsConfigSchema,
  storage: storageConfigSchema.optional().default({ type: "sqlite", path: "data/pandora.db" }),
});

/** Full config (ai, channels, storage). */
export type Config = z.infer<typeof configSchema>;
/** AI config: providers, tools, and agents (operator, optional coder/research). */
export type AIConfig = z.infer<typeof aiConfigSchema>;
/** Single agent config: provider, model, optional description. */
export type AgentConfig = z.infer<typeof agentConfigSchema>;
/** Tool-specific configuration (varies per tool). */
export type ToolConfig = z.infer<typeof toolConfigSchema>;
/** Telegram channel config: enabled, token, ownerId. */
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
/** Storage config: type (`memory` | `sqlite`), path (for SQLite). */
export type StorageConfig = z.infer<typeof storageConfigSchema>;

/**
 * Load and validate configuration from a JSONC file.
 *
 * @param configPath - Path to the JSONC config file (default: `"config.jsonc"`).
 * @returns Parsed and validated config.
 * @throws {Error} If the file is missing or validation fails.
 */
export async function loadConfig(
  configPath: string = "config.jsonc"
): Promise<Config> {
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const content = await file.text();
  const rawConfig = parse(content);

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}

/**
 * Validate configuration after loading.
 * Ensures all configured agents have their required providers set up.
 *
 * @param config - Loaded config to validate.
 * @param availableToolNames - List of known tool names from the tool registry.
 * @throws {Error} If any agent's provider is missing or tool is unknown.
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

  // Check each configured agent has its provider set up
  for (const [agentName, agentConfig] of Object.entries(config.ai.agents)) {
    if (!agentConfig) continue;

    const providerName = agentConfig.provider as ProviderName;
    const provider = config.ai.providers[providerName];

    if (!provider) {
      errors.push(
        `Agent '${agentName}' uses provider '${providerName}' but it's not configured`
      );
    } else if (!provider.apiKey) {
      errors.push(
        `Agent '${agentName}' uses provider '${providerName}' but API key is missing`
      );
    }
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
