/**
 * Pandora AI Agent - Entry point.
 *
 * Loads config, creates store/agent/gateway, starts enabled channels (e.g. Telegram),
 * and registers SIGINT/SIGTERM for graceful shutdown.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadExtensions,
  loadChannels,
  loadConfig,
  validateConfig,
  createStore,
  createMemory,
  createScheduler,
  createChannels,
  getAvailableToolNames,
  createModel,
  Agent,
  Gateway,
  logger,
  type Channel,
  type IMemoryProvider,
  type IScheduler,
  type GatewayContextOptions,
} from "@pandora/core";
import { createMemoryTools } from "./tools/memory";
import { createSchedulerTools } from "./tools/scheduler";
import { SimpleScheduler } from "./scheduler/simple";

// Get the directory of this file for resolving extension paths
const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = __dirname;
const rootDir = resolve(__dirname, "../../.."); // monorepo root
const configPath = resolve(rootDir, "config.jsonc");

/**
 * Auto-discover and load all user extensions.
 * This triggers self-registration for subagents, channels, tools, stores, memory providers, and schedulers.
 */
async function loadAllExtensions(): Promise<void> {
  await loadExtensions(resolve(srcDir, "subagents"));
  await loadChannels(resolve(srcDir, "channels"));
  await loadExtensions(resolve(srcDir, "tools"));
  await loadExtensions(resolve(srcDir, "store"));
  await loadExtensions(resolve(srcDir, "memory"));
  await loadExtensions(resolve(srcDir, "scheduler"));
}

/** Load config, init store/agent/gateway/channels, and run until shutdown. */
async function main(): Promise<void> {
  logger.startup("Pandora AI Agent starting");

  // Auto-discover and load all extensions before using registries
  await loadAllExtensions();

  // Load and validate configuration
  const config = await loadConfig(configPath);
  validateConfig(config, getAvailableToolNames());

  // Apply log level from config
  logger.setLevel(config.logLevel);

  const operatorConfig = config.ai.agents.operator;
  const subagents = Object.keys(config.ai.agents).filter(
    (k) => k !== "operator" && config.ai.agents[k as keyof typeof config.ai.agents]
  );

  logger.startup("Configuration loaded", {
    operator: operatorConfig.model,
    subagents: subagents.length > 0 ? subagents.join(", ") : "none",
  });

  // Initialize core components
  const store = createStore(config.storage);
  const agent = await Agent.create(config.ai, config.personality);

  // Initialize memory if configured (auto-injects tools into agent)
  let memory: IMemoryProvider | null = null;
  if (config.memory) {
    memory = await createMemory({
      ...config.memory,
      apiKey: config.ai.gateway.apiKey, // Reuse gateway API key for embeddings
    });

    if (memory) {
      const memoryTools = createMemoryTools(memory);
      agent.addActionTools(memoryTools);
      logger.startup("Memory initialized", {
        type: config.memory.type,
        episodic: memory.episodic ? "enabled" : "disabled",
        semantic: memory.semantic ? "enabled" : "disabled",
      });
    }
  }

  // Context management is always enabled
  // Use summarizer agent if configured, otherwise fall back to operator model
  const summarizerConfig = config.ai.agents.summarizer ?? operatorConfig;
  const contextOptions: GatewayContextOptions = {
    operatorModelId: operatorConfig.model,
    summaryModel: createModel(summarizerConfig.model, config.ai.gateway.apiKey),
  };
  logger.startup("Context management enabled", {
    summaryModel: summarizerConfig.model,
  });

  const gateway = new Gateway(store, agent, memory, contextOptions);

  // Initialize scheduler if configured
  let scheduler: IScheduler | null = null;
  if (config.scheduler) {
    scheduler = await createScheduler(config.scheduler);

    if (scheduler) {
      // Register callback with gateway for task execution
      scheduler.onTrigger((taskId) => gateway.handleScheduledTask(taskId));

      // Create and inject scheduler tools
      const schedulerTools = createSchedulerTools(store, scheduler, gateway);
      agent.addActionTools(schedulerTools);

      // Set up recovery callback for simple scheduler
      if (scheduler instanceof SimpleScheduler) {
        scheduler.setRecoveryCallback(async () => {
          const pendingTasks = await store.getPendingTasks();
          logger.info("Scheduler", `Recovering ${pendingTasks.length} pending tasks`);

          for (const task of pendingTasks) {
            try {
              if (task.type === "once" && task.runAt) {
                await scheduler!.scheduleOnce(task.id, task.runAt);
              } else if (task.type === "recurring" && task.cronExpression) {
                await scheduler!.scheduleRecurring(task.id, task.cronExpression, task.timezone);
              }
            } catch (error) {
              logger.warn("Scheduler", `Failed to recover task ${task.id}`, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        });
      }

      logger.startup("Scheduler initialized", { type: config.scheduler.type });
    }
  }

  // Create all enabled channels from registry
  const channels: Channel[] = createChannels(config, gateway);

  // Register channels with gateway for push capability
  for (const channel of channels) {
    gateway.registerChannel(channel);
  }

  // Start all channels
  for (const channel of channels) {
    try {
      await channel.start();
    } catch (error) {
      logger.error("Startup", `Failed to start channel: ${channel.name}`, error);
      throw error;
    }
  }

  // Start scheduler AFTER channels are registered and started
  if (scheduler) {
    await scheduler.start();
    logger.startup("Scheduler started");
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

    // Stop scheduler first (prevents new task triggers)
    if (scheduler) {
      try {
        await scheduler.stop();
      } catch (error) {
        logger.error("Shutdown", "Failed to stop scheduler", error);
      }
    }

    for (const channel of channels) {
      try {
        await channel.stop();
      } catch (error) {
        logger.error("Shutdown", `Failed to stop channel: ${channel.name}`, error);
      }
    }

    if (memory) {
      try {
        await memory.close();
      } catch (error) {
        logger.error("Shutdown", "Failed to close memory provider", error);
      }
    }

    try {
      await store.close();
    } catch (error) {
      logger.error("Shutdown", "Failed to close store", error);
    }

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
