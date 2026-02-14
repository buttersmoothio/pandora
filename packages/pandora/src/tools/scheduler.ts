/**
 * Scheduler Tools - Schedule reminders and recurring tasks
 *
 * These tools are auto-injected when scheduler is configured (not via defineTool).
 * They coordinate between Store (metadata) and Scheduler (timing).
 */

import { tool, type Tool } from "ai";
import { z } from "zod";
import * as chrono from "chrono-node";
import { CronExpressionParser } from "cron-parser";
import {
  requestContext,
  logger,
  type IMessageStore,
  type IScheduler,
  type Gateway,
} from "@pandora/core";

/** Scheduler tool names (for filtering if needed) */
export const SCHEDULER_TOOL_NAMES = [
  "scheduleReminder",
  "scheduleRecurring",
  "listScheduled",
  "cancelScheduled",
  "pushMessage",
] as const;

/**
 * Parse natural language time to Unix epoch seconds.
 * Supports expressions like "in 2 hours", "tomorrow at 9am", "next Monday".
 *
 * @param when - Natural language time expression
 * @returns Unix epoch seconds
 * @throws Error if the expression can't be parsed
 */
function parseNaturalTime(when: string): number {
  const results = chrono.parse(when, new Date());

  if (results.length === 0 || !results[0]?.start) {
    throw new Error(
      `Could not parse time expression: "${when}". Try formats like "in 2 hours", "tomorrow at 9am", or "next Monday at 3pm".`
    );
  }

  const date = results[0].start.date();
  const unixSeconds = Math.floor(date.getTime() / 1000);

  // Don't allow scheduling in the past
  const now = Math.floor(Date.now() / 1000);
  if (unixSeconds <= now) {
    throw new Error(
      `Cannot schedule in the past. Parsed time "${date.toISOString()}" is before now.`
    );
  }

  return unixSeconds;
}

/**
 * Parse a schedule pattern to cron expression.
 * Supports expressions like "every day at 9am", "every Monday", "every hour".
 *
 * @param schedule - Natural language schedule pattern
 * @param timezone - Optional timezone
 * @returns Object with cronExpression and timezone
 */
function parseSchedulePattern(
  schedule: string,
  timezone?: string
): { cronExpression: string; timezone: string } {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lower = schedule.toLowerCase().trim();

  // Common patterns
  const patterns: Record<string, string> = {
    // Time-based
    "every minute": "* * * * *",
    "every 5 minutes": "*/5 * * * *",
    "every 10 minutes": "*/10 * * * *",
    "every 15 minutes": "*/15 * * * *",
    "every 30 minutes": "*/30 * * * *",
    "every hour": "0 * * * *",
    "hourly": "0 * * * *",

    // Day-based
    "every day": "0 9 * * *", // Default to 9am
    "daily": "0 9 * * *",
    "every morning": "0 9 * * *",
    "every evening": "0 18 * * *",
    "every night": "0 21 * * *",

    // Week-based
    "every week": "0 9 * * 1", // Monday 9am
    "weekly": "0 9 * * 1",
    "every monday": "0 9 * * 1",
    "every tuesday": "0 9 * * 2",
    "every wednesday": "0 9 * * 3",
    "every thursday": "0 9 * * 4",
    "every friday": "0 9 * * 5",
    "every saturday": "0 9 * * 6",
    "every sunday": "0 9 * * 0",
    "every weekday": "0 9 * * 1-5",
    "every weekend": "0 10 * * 0,6",

    // Month-based
    "every month": "0 9 1 * *", // 1st of month, 9am
    "monthly": "0 9 1 * *",
  };

  // Check for exact match
  if (patterns[lower]) {
    return { cronExpression: patterns[lower], timezone: tz };
  }

  // Try to parse "every <day> at <time>" patterns
  const dayAtTimeMatch = lower.match(
    /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (dayAtTimeMatch && dayAtTimeMatch[1] && dayAtTimeMatch[2]) {
    const days: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const day = days[dayAtTimeMatch[1].toLowerCase()];
    let hour = parseInt(dayAtTimeMatch[2], 10);
    const minute = dayAtTimeMatch[3] ? parseInt(dayAtTimeMatch[3], 10) : 0;
    const period = dayAtTimeMatch[4]?.toLowerCase();

    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    return { cronExpression: `${minute} ${hour} * * ${day}`, timezone: tz };
  }

  // Try to parse "every day at <time>" patterns
  const dailyAtMatch = lower.match(
    /every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (dailyAtMatch && dailyAtMatch[1]) {
    let hour = parseInt(dailyAtMatch[1], 10);
    const minute = dailyAtMatch[2] ? parseInt(dailyAtMatch[2], 10) : 0;
    const period = dailyAtMatch[3]?.toLowerCase();

    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    return { cronExpression: `${minute} ${hour} * * *`, timezone: tz };
  }

  // If it looks like a cron expression already, validate it
  if (/^[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+$/.test(schedule.trim())) {
    try {
      CronExpressionParser.parse(schedule.trim(), { tz });
      return { cronExpression: schedule.trim(), timezone: tz };
    } catch {
      throw new Error(`Invalid cron expression: "${schedule}"`);
    }
  }

  throw new Error(
    `Could not parse schedule pattern: "${schedule}". ` +
      `Try formats like "every day at 9am", "every Monday", "every hour", or a cron expression.`
  );
}

/**
 * Create scheduler tools for the agent.
 * Called from index.ts when scheduler is available, then injected into the Agent.
 *
 * @param store - Message store for task metadata
 * @param scheduler - Scheduler for timing
 * @param gateway - Gateway for push message delivery
 * @returns Record of scheduler tools
 */
export function createSchedulerTools(
  store: IMessageStore,
  scheduler: IScheduler,
  gateway: Gateway
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  tools.scheduleReminder = tool({
    description:
      "Schedule a reminder for a future time. " +
      "Use natural language for the time (e.g., 'in 2 hours', 'tomorrow at 9am', 'next Monday at 3pm'). " +
      "When the reminder triggers, you will receive a message and can notify the user.",
    inputSchema: z.object({
      when: z
        .string()
        .describe(
          "When to remind (e.g., 'in 30 minutes', 'tomorrow at 9am', 'next Friday at 2pm')"
        ),
      description: z
        .string()
        .describe("What to remind about (e.g., 'Check on the deployment', 'Call back John')"),
      context: z
        .string()
        .optional()
        .describe("Additional context to include when the reminder triggers"),
    }),
    execute: async ({ when, description, context }) => {
      const ctx = requestContext.getStore();
      if (!ctx) {
        return { success: false, error: "No request context available" };
      }

      try {
        const runAt = parseNaturalTime(when);

        // Create task metadata in store
        const taskId = await store.createScheduledTask({
          conversationId: ctx.conversationId,
          channelName: ctx.channelName,
          userId: ctx.userId,
          type: "once",
          taskType: "reminder",
          description,
          context: context ? { note: context } : undefined,
          runAt,
        });

        // Register with scheduler
        await scheduler.scheduleOnce(taskId, runAt);

        const scheduledDate = new Date(runAt * 1000);
        logger.info("Scheduler", "Reminder scheduled", {
          taskId,
          description,
          scheduledFor: scheduledDate.toISOString(),
        });

        return {
          success: true,
          taskId,
          scheduledFor: scheduledDate.toISOString(),
          message: `Reminder scheduled for ${scheduledDate.toLocaleString()}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  });

  tools.scheduleRecurring = tool({
    description:
      "Schedule a recurring task. " +
      "Use natural language for the schedule (e.g., 'every day at 9am', 'every Monday', 'every hour'). " +
      "Each time the task triggers, you will receive a message and can notify the user.",
    inputSchema: z.object({
      schedule: z
        .string()
        .describe(
          "When to run (e.g., 'every day at 9am', 'every Monday at 2pm', 'every hour')"
        ),
      description: z
        .string()
        .describe("What this recurring task is for (e.g., 'Daily standup reminder', 'Weekly report')"),
      maxRuns: z
        .number()
        .positive()
        .optional()
        .describe("Maximum number of times to run (omit for unlimited)"),
    }),
    execute: async ({ schedule, description, maxRuns }) => {
      const ctx = requestContext.getStore();
      if (!ctx) {
        return { success: false, error: "No request context available" };
      }

      try {
        const { cronExpression, timezone } = parseSchedulePattern(schedule);

        // Create task metadata in store
        const taskId = await store.createScheduledTask({
          conversationId: ctx.conversationId,
          channelName: ctx.channelName,
          userId: ctx.userId,
          type: "recurring",
          taskType: "custom",
          description,
          cronExpression,
          timezone,
          maxRuns,
        });

        // Register with scheduler
        await scheduler.scheduleRecurring(taskId, cronExpression, timezone);

        logger.info("Scheduler", "Recurring task scheduled", {
          taskId,
          description,
          cronExpression,
          timezone,
        });

        return {
          success: true,
          taskId,
          schedule: cronExpression,
          timezone,
          maxRuns: maxRuns ?? "unlimited",
          message: `Recurring task scheduled: ${description}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  });

  tools.listScheduled = tool({
    description:
      "List all scheduled tasks for this conversation. " +
      "Shows pending reminders and recurring tasks.",
    inputSchema: z.object({}),
    execute: async () => {
      const ctx = requestContext.getStore();
      if (!ctx) {
        return { success: false, error: "No request context available" };
      }

      const tasks = await store.listScheduledTasks(ctx.conversationId);

      return {
        success: true,
        tasks: tasks.map((t) => ({
          id: t.id,
          type: t.type,
          taskType: t.taskType,
          description: t.description,
          status: t.status,
          runAt: t.runAt ? new Date(t.runAt * 1000).toISOString() : undefined,
          cronExpression: t.cronExpression,
          timezone: t.timezone,
          runCount: t.runCount,
          maxRuns: t.maxRuns,
          createdAt: new Date(t.createdAt * 1000).toISOString(),
        })),
      };
    },
  });

  tools.cancelScheduled = tool({
    description: "Cancel a scheduled task by its ID.",
    inputSchema: z.object({
      taskId: z.string().describe("The ID of the task to cancel"),
    }),
    execute: async ({ taskId }) => {
      try {
        // Cancel in scheduler
        await scheduler.cancel(taskId);

        // Update status in store
        await store.updateScheduledTask(taskId, { status: "cancelled" });

        logger.info("Scheduler", "Task cancelled", { taskId });

        return { success: true, message: `Task ${taskId} cancelled` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  });

  tools.pushMessage = tool({
    description:
      "Send a proactive message to the user. " +
      "Use this for scheduled reminders, notifications, or urgent alerts. " +
      "Only works on channels that support push notifications (e.g., Telegram, Web with active connection).",
    inputSchema: z.object({
      message: z
        .string()
        .describe("The message content to send to the user"),
    }),
    execute: async ({ message }) => {
      const ctx = requestContext.getStore();
      if (!ctx) {
        return { success: false, error: "No request context available" };
      }

      try {
        await gateway.pushToChannel(ctx.channelName, ctx.userId, message);
        return { success: true, message: "Message sent to user" };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMsg };
      }
    },
  });

  return tools;
}
