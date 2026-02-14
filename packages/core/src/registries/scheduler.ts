/**
 * Scheduler Registry - Framework infrastructure for registering scheduler backends
 *
 * Schedulers handle timing for scheduled tasks (reminders, recurring tasks, etc.).
 * The scheduler is intentionally thin - it only handles timing and callbacks.
 * All task metadata is stored in the message store.
 *
 * Each backend is defined in src/scheduler/ and self-registers using defineScheduler().
 */

import type { SchedulerConfig } from "../config";
import { logger } from "../logger";

// ============================================================================
// Types
// ============================================================================

/** Callback when a scheduled task triggers */
export type SchedulerCallback = (taskId: string) => Promise<void>;

/**
 * Thin scheduler interface - handles ONLY timing, not metadata.
 * All task metadata lives in the message store.
 *
 * Backends: setInterval, node-cron, Redis, BullMQ, AWS EventBridge, etc.
 */
export interface IScheduler {
  /**
   * Schedule a one-time task.
   * @param taskId - Reference ID (metadata stored separately in message store)
   * @param runAt - Unix epoch seconds
   */
  scheduleOnce(taskId: string, runAt: number): Promise<void>;

  /**
   * Schedule a recurring task.
   * @param taskId - Reference ID (metadata stored separately in message store)
   * @param cronExpression - Cron pattern (e.g., "0 9 * * *")
   * @param timezone - Timezone for cron interpretation (default: UTC)
   */
  scheduleRecurring(taskId: string, cronExpression: string, timezone?: string): Promise<void>;

  /**
   * Cancel a scheduled task.
   * No-op if task doesn't exist.
   */
  cancel(taskId: string): Promise<void>;

  /**
   * Check if a task is currently scheduled.
   */
  isScheduled(taskId: string): Promise<boolean>;

  /**
   * Register callback for when tasks trigger.
   * Only one callback is active - new registration replaces old.
   */
  onTrigger(callback: SchedulerCallback): void;

  /**
   * Start the scheduler (begin processing).
   * Should recover pending tasks from store and reschedule them.
   */
  start(): Promise<void>;

  /**
   * Stop the scheduler gracefully.
   * Cancels all pending timers but does not delete tasks from store.
   */
  stop(): Promise<void>;
}

// ============================================================================
// Registry
// ============================================================================

/** Factory function for creating a scheduler */
export type SchedulerFactory = (config: SchedulerConfig) => Promise<IScheduler>;

/** Scheduler factory registration */
export interface SchedulerFactoryRegistration {
  /** Scheduler type identifier (matches config.scheduler.type) */
  type: string;
  /** Async factory to create the scheduler */
  create: SchedulerFactory;
}

/** Registry of all scheduler factories */
const registry = new Map<string, SchedulerFactoryRegistration>();

/** Cached singleton instance */
let cachedScheduler: IScheduler | null = null;

/**
 * Register a scheduler factory.
 * Call this from each scheduler implementation file to self-register.
 *
 * @param factory - The scheduler factory registration
 * @returns The same registration (for export convenience)
 */
export function defineScheduler(factory: SchedulerFactoryRegistration): SchedulerFactoryRegistration {
  registry.set(factory.type, factory);
  logger.debug("Registry", "Scheduler registered", { type: factory.type });
  return factory;
}

/**
 * Get all registered scheduler types.
 */
export function getAvailableSchedulerTypes(): string[] {
  return Array.from(registry.keys());
}

/**
 * Create and cache a scheduler from config.
 * Returns null if config is undefined, disabled, or missing.
 *
 * @param config - Scheduler config (type, pollInterval, etc.)
 * @returns Cached scheduler instance, or null if not configured/disabled
 * @throws {Error} If config.type is not registered
 */
export async function createScheduler(config?: SchedulerConfig): Promise<IScheduler | null> {
  // Return null if not configured or disabled
  if (!config || config.enabled === false) {
    return null;
  }

  // Return cached instance if available
  if (cachedScheduler) {
    logger.debug("Registry", "Returning cached scheduler");
    return cachedScheduler;
  }

  logger.debug("Registry", "Creating scheduler", { type: config.type });
  const factory = registry.get(config.type);

  if (!factory) {
    const available = getAvailableSchedulerTypes().join(", ");
    throw new Error(
      `Unknown scheduler type: "${config.type}". Available types: ${available || "none registered"}`
    );
  }

  cachedScheduler = await factory.create(config);
  return cachedScheduler;
}

/**
 * Get the cached scheduler singleton.
 * Returns null if createScheduler() hasn't been called or scheduler isn't configured.
 */
export function getScheduler(): IScheduler | null {
  return cachedScheduler;
}

/**
 * Clear the cached scheduler (for testing).
 * @internal
 */
export function _clearSchedulerCache(): void {
  cachedScheduler = null;
}
