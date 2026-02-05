/**
 * Debug logger for message flow tracking
 *
 * Logs metadata about message receive/send/tool calls without logging content.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const COLORS = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function timestamp(): string {
  return new Date().toISOString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function log(level: LogLevel, category: string, message: string, meta?: Record<string, unknown>): void {
  const color = COLORS[level];
  const ts = COLORS.dim + timestamp() + COLORS.reset;
  const cat = COLORS.bold + `[${category}]` + COLORS.reset;
  const msg = color + message + COLORS.reset;

  let output = `${ts} ${cat} ${msg}`;

  if (meta && Object.keys(meta).length > 0) {
    const metaStr = Object.entries(meta)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    output += ` ${COLORS.dim}${metaStr}${COLORS.reset}`;
  }

  console.log(output);
}

/** Structured logger for message flow, agent, and channel events. Logs metadata only (no message content). */
export const logger = {
  /** @param channel - Channel name. @param conversationId - Conversation ID. @param userId - User ID. */
  messageReceived(channel: string, conversationId: string, userId: string): void {
    log("info", "Gateway", "Message received", { channel, conversationId, userId });
  },

  /** @param durationMs - Total time from receive to send. */
  messageSent(channel: string, conversationId: string, responseLength: number, durationMs: number): void {
    log("info", "Gateway", "Response sent", {
      channel,
      conversationId,
      chars: responseLength,
      duration: formatDuration(durationMs),
    });
  },

  /** @param historyLength - Number of messages in conversation history. */
  agentStart(provider: string, model: string, historyLength: number): void {
    log("debug", "Agent", "Processing started", { provider, model, historyMessages: historyLength });
  },

  /** @param durationMs - Processing time. @param steps - Number of tool-call steps. */
  agentComplete(durationMs: number, steps: number): void {
    log("debug", "Agent", "Processing complete", { duration: formatDuration(durationMs), steps });
  },

  /** @param toolName - Name of the tool called. @param durationMs - Optional duration. */
  toolCall(toolName: string, durationMs?: number): void {
    const meta: Record<string, unknown> = { tool: toolName };
    if (durationMs !== undefined) {
      meta.duration = formatDuration(durationMs);
    }
    log("debug", "Agent", "Tool called", meta);
  },

  /** @param name - Subagent name (e.g. `coder`, `research`). */
  subagentStart(name: string, provider: string, model: string): void {
    log("debug", "Subagent", `${name} started`, { provider, model });
  },

  /** @param durationMs - Subagent execution time. */
  subagentComplete(name: string, durationMs: number): void {
    log("debug", "Subagent", `${name} complete`, { duration: formatDuration(durationMs) });
  },

  /** @param channel - Channel name. @param event - Event description. @param meta - Optional key-value meta. */
  channel(channel: string, event: string, meta?: Record<string, unknown>): void {
    log("debug", "Channel", `[${channel}] ${event}`, meta);
  },

  /** @param category - Log category. @param message - Error message. @param error - Optional error (message extracted if Error). */
  error(category: string, message: string, error?: unknown): void {
    const meta: Record<string, unknown> = {};
    if (error instanceof Error) {
      meta.error = error.message;
    }
    log("error", category, message, meta);
  },

  /** @param message - Startup message. @param meta - Optional key-value meta. */
  startup(message: string, meta?: Record<string, unknown>): void {
    log("info", "Startup", message, meta);
  },
};
