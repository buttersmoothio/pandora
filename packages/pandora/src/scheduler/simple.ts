/**
 * SimpleScheduler - In-memory scheduler using setInterval
 *
 * A lightweight scheduler implementation for single-instance deployments.
 * Uses setInterval to poll for due tasks and cron-parser for recurring tasks.
 *
 * This scheduler does not persist its internal state - it recovers pending
 * tasks from the store on startup via the recovery callback.
 */

import { CronExpressionParser, type CronExpression } from "cron-parser";
import {
  defineScheduler,
  logger,
  type IScheduler,
  type SchedulerCallback,
  type SchedulerConfig,
} from "@pandora/core";

/** Internal task tracking */
interface TrackedTask {
  taskId: string;
  type: "once" | "recurring";
  runAt?: number;
  cronExpression?: string;
  timezone?: string;
  cronIterator?: CronExpression;
  nextRun?: number;
}

/**
 * Simple in-memory scheduler using setInterval.
 * Suitable for single-instance deployments.
 */
export class SimpleScheduler implements IScheduler {
  private tasks = new Map<string, TrackedTask>();
  private callback: SchedulerCallback | null = null;
  private pollInterval: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private recoveryCallback: (() => Promise<void>) | null = null;

  constructor(config: SchedulerConfig) {
    this.pollInterval = config.pollInterval ?? 10_000;
  }

  /**
   * Set a recovery callback that will be called on start().
   * The callback should re-register pending tasks from the store.
   */
  setRecoveryCallback(callback: () => Promise<void>): void {
    this.recoveryCallback = callback;
  }

  /** @inheritdoc */
  async scheduleOnce(taskId: string, runAt: number): Promise<void> {
    logger.debug("Scheduler", "Scheduling one-time task", { taskId, runAt: new Date(runAt * 1000).toISOString() });

    this.tasks.set(taskId, {
      taskId,
      type: "once",
      runAt,
      nextRun: runAt,
    });
  }

  /** @inheritdoc */
  async scheduleRecurring(taskId: string, cronExpression: string, timezone?: string): Promise<void> {
    logger.debug("Scheduler", "Scheduling recurring task", { taskId, cronExpression, timezone });

    try {
      const cronIterator = CronExpressionParser.parse(cronExpression, {
        tz: timezone ?? "UTC",
      });

      const nextDate = cronIterator.next().toDate();
      const nextRun = Math.floor(nextDate.getTime() / 1000);

      this.tasks.set(taskId, {
        taskId,
        type: "recurring",
        cronExpression,
        timezone: timezone ?? "UTC",
        cronIterator,
        nextRun,
      });

      logger.debug("Scheduler", "Next run scheduled", { taskId, nextRun: nextDate.toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid cron expression "${cronExpression}": ${message}`);
    }
  }

  /** @inheritdoc */
  async cancel(taskId: string): Promise<void> {
    const existed = this.tasks.delete(taskId);
    if (existed) {
      logger.debug("Scheduler", "Cancelled task", { taskId });
    }
  }

  /** @inheritdoc */
  async isScheduled(taskId: string): Promise<boolean> {
    return this.tasks.has(taskId);
  }

  /** @inheritdoc */
  onTrigger(callback: SchedulerCallback): void {
    this.callback = callback;
    logger.debug("Scheduler", "Trigger callback registered");
  }

  /** @inheritdoc */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Scheduler", "Scheduler already running");
      return;
    }

    this.running = true;

    // Run recovery callback to restore pending tasks
    if (this.recoveryCallback) {
      logger.info("Scheduler", "Running recovery callback");
      await this.recoveryCallback();
    }

    // Start the poll timer
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollInterval);

    // Run initial poll immediately
    void this.poll();

    logger.startup("SimpleScheduler started", {
      pollInterval: this.pollInterval,
      taskCount: this.tasks.size,
    });
  }

  /** @inheritdoc */
  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Don't clear tasks - they're in the store and will be recovered on restart
    logger.info("Scheduler", "SimpleScheduler stopped", { taskCount: this.tasks.size });
  }

  /** Poll for due tasks and trigger them */
  private async poll(): Promise<void> {
    if (!this.callback) {
      logger.warn("Scheduler", "No trigger callback registered, skipping poll");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const dueTasks: TrackedTask[] = [];

    // Find all tasks that are due
    for (const task of this.tasks.values()) {
      if (task.nextRun && task.nextRun <= now) {
        dueTasks.push(task);
      }
    }

    // Process due tasks
    for (const task of dueTasks) {
      logger.info("Scheduler", "Triggering task", { taskId: task.taskId, type: task.type });

      try {
        // Fire the callback
        await this.callback(task.taskId);

        // Handle task completion based on type
        if (task.type === "once") {
          // One-time task: remove from internal tracking
          // (Store status update is handled by gateway)
          this.tasks.delete(task.taskId);
        } else if (task.type === "recurring" && task.cronExpression) {
          // Recurring task: compute next run time
          try {
            const cronIterator = CronExpressionParser.parse(task.cronExpression, {
              tz: task.timezone ?? "UTC",
            });
            const nextDate = cronIterator.next().toDate();
            task.nextRun = Math.floor(nextDate.getTime() / 1000);
            task.cronIterator = cronIterator;

            logger.debug("Scheduler", "Rescheduled recurring task", {
              taskId: task.taskId,
              nextRun: nextDate.toISOString(),
            });
          } catch (error) {
            logger.error("Scheduler", "Failed to compute next run time", { taskId: task.taskId, error });
            this.tasks.delete(task.taskId);
          }
        }
      } catch (error) {
        // Log error but don't crash - gateway handles retry logic
        logger.error("Scheduler", "Task trigger failed", { taskId: task.taskId, error });
      }
    }
  }
}

// Self-register the scheduler
export default defineScheduler({
  type: "simple",
  create: async (config: SchedulerConfig) => new SimpleScheduler(config),
});
