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
} from "../core/types.ts";

/**
 * Base configuration that all channels need
 */
export interface BaseChannelConfig {
  enabled: boolean;
  ownerId: string;
}

/**
 * Helper to check if a user is the owner
 */
export function isOwner(userId: string, ownerId: string): boolean {
  return userId === ownerId;
}
