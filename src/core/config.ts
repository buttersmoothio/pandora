/**
 * Configuration loader with YAML parsing, env var interpolation, and Zod validation
 */

import { parse as parseYaml } from "yaml";
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
 * Schema for AI configuration with providers and agents
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
 * Full configuration schema
 */
const configSchema = z.object({
  ai: aiConfigSchema,
  channels: channelsConfigSchema,
});

/**
 * Inferred TypeScript type from the schema
 */
export type Config = z.infer<typeof configSchema>;
export type AIConfig = z.infer<typeof aiConfigSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;

/**
 * Interpolate environment variables in a string.
 * Supports ${VAR_NAME} syntax.
 */
function interpolateEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar: string) => {
    const envValue = process.env[envVar];
    if (envValue === undefined) {
      throw new Error(`Environment variable '${envVar}' is not defined`);
    }
    return envValue;
  });
}

/**
 * Recursively interpolate environment variables in an object
 */
function interpolateObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return interpolateEnvVars(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(interpolateObject);
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value);
    }
    return result;
  }

  return obj;
}

/**
 * Load and validate configuration from a YAML file.
 * Environment variables in ${VAR_NAME} format are interpolated.
 */
export async function loadConfig(
  configPath: string = "config.yaml"
): Promise<Config> {
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const content = await file.text();
  const rawConfig = parseYaml(content);

  // Interpolate environment variables
  const interpolatedConfig = interpolateObject(rawConfig);

  // Validate with Zod
  const result = configSchema.safeParse(interpolatedConfig);

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
 */
export function validateConfig(config: Config): void {
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

  if (errors.length > 0) {
    throw new Error(
      `Configuration errors:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
}
