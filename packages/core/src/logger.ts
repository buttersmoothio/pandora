/**
 * Debug logger for message flow tracking
 *
 * Logs metadata about message receive/send/tool calls without logging content.
 * In verbose mode, additionally logs full model prompts and responses.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

/** Configured verbosity: `"normal"` logs metadata only; `"verbose"` adds model I/O. */
let verboseMode = false;

const COLORS = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m", // magenta - for verbose model I/O
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

/**
 * Log a verbose-only block (model prompts / responses).
 * Skipped entirely when `verboseMode` is `false`.
 */
function logVerbose(category: string, label: string, content: string): void {
  if (!verboseMode) return;

  const ts = COLORS.dim + timestamp() + COLORS.reset;
  const cat = COLORS.bold + `[${category}]` + COLORS.reset;
  const lbl = COLORS.magenta + label + COLORS.reset;
  const separator = COLORS.dim + "─".repeat(60) + COLORS.reset;

  console.log(`${ts} ${cat} ${lbl}`);
  console.log(separator);
  console.log(content);
  console.log(separator);
}

/**
 * Truncate a string to `max` characters, appending "…" if truncated.
 * Useful to keep verbose logs readable for very large payloads.
 */
function truncate(str: string, max = 2000): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + `… (${str.length - max} more chars)`;
}

/**
 * Pretty-format a value for verbose logging.
 * Objects/arrays are JSON-stringified with indentation; strings passed through.
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Structured logger for message flow, agent, and channel events. Logs metadata only (no message content). */
export const logger = {
  /**
   * Set the verbosity level from config.
   * @param level - `"normal"` or `"verbose"`.
   */
  setLevel(level: "normal" | "verbose"): void {
    verboseMode = level === "verbose";
  },

  /** Whether verbose (model I/O) logging is enabled. */
  get isVerbose(): boolean {
    return verboseMode;
  },

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

  /**
   * Log a tool call. Always logs tool name + duration.
   * In verbose mode, additionally logs the full arguments and result.
   *
   * @param toolName - Name of the tool called.
   * @param options - Optional details: args, result, error, duration, agentName.
   */
  toolCall(
    toolName: string,
    options?: {
      args?: unknown;
      result?: unknown;
      error?: unknown;
      durationMs?: number;
      agentName?: string;
    }
  ): void {
    const meta: Record<string, unknown> = { tool: toolName };
    const category = options?.agentName ? `Tool:${options.agentName}` : "Tool";

    if (options?.durationMs !== undefined) {
      meta.duration = formatDuration(options.durationMs);
    }
    log("debug", category, "Tool called", meta);

    // Verbose: log full arguments
    if (verboseMode && options?.args !== undefined) {
      const formatted = truncate(formatValue(options.args));
      logVerbose(category, `▶ ${toolName} args`, formatted);
    }

    // Verbose: log full result
    if (verboseMode && options?.result !== undefined) {
      const formatted = truncate(formatValue(options.result));
      logVerbose(category, `◀ ${toolName} result`, formatted);
    }

    // Verbose: log tool error
    if (verboseMode && options?.error !== undefined) {
      const errorMsg = options.error instanceof Error
        ? `${options.error.message}\n${options.error.stack ?? ""}`
        : formatValue(options.error);
      logVerbose(category, `✖ ${toolName} error`, truncate(errorMsg));
    }
  },

  /**
   * Log a step finish event (verbose only).
   * Provides visibility into intermediate model text between tool calls.
   *
   * @param agentName - Which agent finished the step.
   * @param stepNumber - 1-based step index.
   * @param finishReason - Why the step finished (e.g. "tool-calls", "stop").
   * @param text - Any intermediate text the model produced in this step.
   * @param toolCallCount - Number of tool calls made in this step.
   * @param usage - Token usage for this step, if available.
   */
  stepFinish(
    agentName: string,
    stepNumber: number,
    finishReason: string,
    text?: string,
    toolCallCount?: number,
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  ): void {
    const meta: Record<string, unknown> = {
      agent: agentName,
      step: stepNumber,
      reason: finishReason,
    };
    if (toolCallCount !== undefined && toolCallCount > 0) {
      meta.toolCalls = toolCallCount;
    }
    if (usage) {
      if (usage.promptTokens !== undefined) meta.promptTokens = usage.promptTokens;
      if (usage.completionTokens !== undefined) meta.completionTokens = usage.completionTokens;
      if (usage.totalTokens !== undefined) meta.totalTokens = usage.totalTokens;
    }

    // Always log step metadata at debug level
    log("debug", "Agent", `Step ${stepNumber} finished`, meta);

    // Verbose: log any intermediate text the model produced
    if (verboseMode && text && text.trim().length > 0) {
      logVerbose("Agent", `${agentName} step ${stepNumber} text`, truncate(text));
    }
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

  /** @param category - Log category. @param message - Warning message. @param meta - Optional key-value meta. */
  warn(category: string, message: string, meta?: Record<string, unknown>): void {
    log("warn", category, message, meta);
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

  /**
   * Log the full prompt/messages sent to a model (verbose only).
   * @param agent - Agent name (e.g. `"operator"`, `"coder"`).
   * @param messages - The messages array sent to the model.
   */
  modelInput(agent: string, messages: Array<{ role: string; content: unknown }>): void {
    if (!verboseMode) return;
    const formatted = messages
      .map((m) => {
        const content = typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content, null, 2);
        return `[${m.role}]\n${content}`;
      })
      .join("\n\n");
    logVerbose("Model", `▶ ${agent} prompt`, formatted);
  },

  /**
   * Log the system instructions sent to a model (verbose only).
   * @param agent - Agent name.
   * @param instructions - System instructions string.
   */
  modelInstructions(agent: string, instructions: string): void {
    logVerbose("Model", `▶ ${agent} system instructions`, instructions);
  },

  /**
   * Log the full response received from a model (verbose only).
   * @param agent - Agent name.
   * @param response - The model's text response.
   */
  modelOutput(agent: string, response: string): void {
    logVerbose("Model", `◀ ${agent} response`, response);
  },
};
