/**
 * DateTime tool -- returns the current date and time
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolDefinition } from "./types";

export function createDateTimeTool(): ToolDefinition {
  return {
    name: "datetime",
    tool: tool({
      description: "Get the current date and time. Useful for timestamps, scheduling, and time-sensitive queries.",
      inputSchema: z.object({
        timezone: z.string().optional().describe("IANA timezone (e.g., 'America/New_York', 'Asia/Tokyo'). Defaults to UTC if not provided."),
      }),
      execute: async ({ timezone }) => {
        const date = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone ?? "UTC",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZoneName: "long",
        });

        return {
          iso: date.toISOString(),
          formatted: formatter.format(date),
          timezone: timezone ?? "UTC",
          unix: Math.floor(date.getTime() / 1000),
        };
      },
    }),
  };
}
