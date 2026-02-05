/**
 * Base channel interface and utilities
 *
 * The Channel interface is defined in core/types.ts.
 * This file re-exports it and provides channel-specific utilities.
 */

export type {
  Channel,
  ChannelCapabilities,
  Message,
  MessageHandler,
} from "../core/types";

/**
 * Base configuration that all channels need
 */
export interface BaseChannelConfig {
  enabled: boolean;
  ownerId: string;
}

/**
 * Check if the user is the configured owner (e.g. for owner-only bots).
 *
 * @param userId - Channel user ID.
 * @param ownerId - Configured owner ID from config.
 * @returns `true` if `userId === ownerId`.
 */
export function isOwner(userId: string, ownerId: string): boolean {
  return userId === ownerId;
}
