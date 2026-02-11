/**
 * Channel Registry - Framework infrastructure for registering channels
 *
 * Channels are communication interfaces (Telegram, Discord, etc.).
 * Each channel is defined in src/channels/ and self-registers using defineChannel().
 */

import type { Gateway } from "../gateway";
import type { Config } from "../config";
import type { Channel, ChannelCapabilities } from "../types";
import { logger } from "../logger";

// Re-export types that channel implementations need
export type { Channel, ChannelCapabilities } from "../types";

/**
 * Base configuration for channels.
 * A channel is enabled by being present in the config.
 */
export interface BaseChannelConfig {}

/**
 * Factory definition for a channel.
 * Each channel file exports a definition using defineChannel().
 */
export interface ChannelFactory {
  /** Unique name for this channel */
  name: string;
  /** Config key in channels (e.g. "telegram" maps to config.channels.telegram) */
  configKey: string;
  /** Create the channel instance */
  create: (config: unknown, gateway: Gateway) => Channel;
}

/** Registry of all channel factories */
const registry = new Map<string, ChannelFactory>();

/**
 * Register a channel factory.
 * Call this from each channel file to self-register.
 *
 * @param factory - The channel factory definition
 * @returns The same factory (for export convenience)
 */
export function defineChannel(factory: ChannelFactory): ChannelFactory {
  registry.set(factory.name, factory);
  logger.debug("Registry", "Channel registered", { name: factory.name });
  return factory;
}

/**
 * Get all registered channel factories.
 */
export function getChannelFactories(): ChannelFactory[] {
  return Array.from(registry.values());
}

/**
 * Create all configured channels.
 * A channel is enabled by being present in the config.
 *
 * @param config - Full application config
 * @param gateway - Gateway instance for message handling
 * @returns Array of created channel instances
 */
export function createChannels(config: Config, gateway: Gateway): Channel[] {
  const channels: Channel[] = [];

  for (const factory of registry.values()) {
    const channelConfig = (config.channels as Record<string, unknown>)[factory.configKey];

    if (channelConfig) {
      channels.push(factory.create(channelConfig, gateway));
      logger.debug("Registry", "Channel created", { name: factory.name });
    }
  }

  logger.debug("Registry", `Created ${channels.length} channel(s)`);
  return channels;
}

