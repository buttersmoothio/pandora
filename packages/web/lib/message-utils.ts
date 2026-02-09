/**
 * Shared utilities for message part transformations.
 * Used by both the WebSocket hook and message renderers.
 */

import { generateId } from "ai";
import type { PandoraMessagePart, PandoraMessage } from "@/hooks/use-pandora-chat";

/**
 * Create a message part from a WebSocket event.
 * Returns null for events that don't map to parts (like deltas).
 */
export function createPartFromEvent(
  eventType: string,
  data: Record<string, unknown>
): PandoraMessagePart | null {
  switch (eventType) {
    case "tool-call":
      return {
        type: "dynamic-tool",
        toolName: data.toolName as string,
        toolCallId: data.toolCallId as string,
        state: "input-available",
        input: data.args,
      };
    case "source-url":
      return {
        type: "source-url",
        sourceId: (data.sourceId as string) ?? generateId(),
        url: (data.url as string) ?? "",
        title: data.title as string | undefined,
      };
    case "source-document":
      return {
        type: "source-document",
        sourceId: (data.sourceId as string) ?? generateId(),
        mediaType: (data.mediaType as string) ?? "",
        title: (data.title as string) ?? "",
        filename: data.filename as string | undefined,
      };
    case "file":
      return {
        type: "file",
        mediaType: (data.mediaType as string) ?? "",
        url: (data.url as string) ?? "",
        filename: data.filename as string | undefined,
      };
    // step-start is not stored as a part
    default:
      return null;
  }
}

/** Append a text delta to a message (returns new message) */
export function appendTextDelta(msg: PandoraMessage, text: string): PandoraMessage {
  const parts = [...msg.parts];
  const lastPart = parts[parts.length - 1];
  if (lastPart?.type === "text") {
    parts[parts.length - 1] = { ...lastPart, text: lastPart.text + text };
  } else {
    parts.push({ type: "text", text, state: "streaming" });
  }
  return { ...msg, parts };
}

/** Append a reasoning delta to a message (returns new message) */
export function appendReasoningDelta(msg: PandoraMessage, text: string): PandoraMessage {
  const parts = [...msg.parts];
  const idx = parts.findIndex((p) => p.type === "reasoning");
  if (idx >= 0) {
    const existing = parts[idx] as { type: "reasoning"; text: string; state?: "streaming" | "done" };
    parts[idx] = { ...existing, text: existing.text + text };
  } else {
    parts.unshift({ type: "reasoning", text, state: "streaming" as const });
  }
  return { ...msg, parts };
}

/** Update tool result in a message (returns new message) */
export function updateToolResult(
  msg: PandoraMessage,
  toolCallId: string,
  result: unknown,
  threadId?: string
): PandoraMessage {
  return {
    ...msg,
    parts: msg.parts.map((part) =>
      part.type === "dynamic-tool" && part.toolCallId === toolCallId
        ? { ...part, state: "output-available" as const, output: result, threadId }
        : part
    ),
  };
}

/** Append a part to a message (returns new message) */
export function appendPart(msg: PandoraMessage, part: PandoraMessagePart): PandoraMessage {
  return { ...msg, parts: [...msg.parts, part] };
}

/** Finalize streaming parts in a message (returns new message) */
export function finalizeParts(msg: PandoraMessage): PandoraMessage {
  return {
    ...msg,
    parts: msg.parts.map((part) =>
      part.type === "text" || part.type === "reasoning"
        ? { ...part, state: "done" as const }
        : part
    ),
  };
}
