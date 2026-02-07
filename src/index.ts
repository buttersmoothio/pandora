/**
 * Pandora AI Agent - Entry point.
 *
 * Loads config, creates store/agent/gateway, starts enabled channels (e.g. Telegram),
 * and registers SIGINT/SIGTERM for graceful shutdown.
 */

import { loadConfig, validateConfig } from "./core/config";
import { createStore } from "./store";
import { Agent } from "./core/agent";
import { Gateway } from "./core/gateway";
import { TelegramChannel } from "./channels/telegram/index";
import { logger } from "./core/logger";
import type { Channel } from "./core/types";
import { getAvailableToolNames } from "./tools";

/** Load config, init store/agent/gateway/channels, and run until shutdown. */
async function main(): Promise<void> {
  logger.startup("Pandora AI Agent starting");

  // Load and validate configuration
  const config = await loadConfig();
  validateConfig(config, getAvailableToolNames());

  // Apply log level from config
  logger.setLevel(config.logLevel);

  const operatorConfig = config.ai.agents.operator;
  const subagents = Object.keys(config.ai.agents).filter(
    (k) => k !== "operator" && config.ai.agents[k as keyof typeof config.ai.agents]
  );

  logger.startup("Configuration loaded", {
    operator: `${operatorConfig.provider}/${operatorConfig.model}`,
    subagents: subagents.length > 0 ? subagents.join(", ") : "none",
  });

  // Initialize core components
  const store = createStore(config.storage);
  const agent = new Agent(config.ai);
  const gateway = new Gateway(store, agent);

  // Track active channels for graceful shutdown
  const channels: Channel[] = [];

  // Initialize Telegram channel if enabled
  if (config.channels.telegram?.enabled) {
    const telegram = new TelegramChannel(config.channels.telegram, gateway);
    channels.push(telegram);
    await telegram.start();
  }

  // Check if any channels are enabled
  if (channels.length === 0) {
    logger.error("Startup", "No channels enabled - please enable at least one channel in config.json");
    process.exit(1);
  }

  logger.startup("Pandora is ready", { channels: channels.length });

  // Handle graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.startup(`Shutdown requested (${signal})`);

    for (const channel of channels) {
      await channel.stop();
    }

    await store.close();

    logger.startup("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Run the main function
main().catch((error) => {
  logger.error("Startup", "Fatal error", error);
  process.exit(1);
});
