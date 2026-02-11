/**
 * DateTime tool - Returns the current date and time
 *
 * Useful for timestamps, scheduling, and time-sensitive queries.
 */

import { tool } from "ai";
import { z } from "zod";
import { defineTool, type ToolConfig } from "@pandora/core";

/** Detect the system's IANA timezone (e.g., 'America/New_York') */
const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default defineTool({
  name: "datetime",
  factory: (config?: ToolConfig) => {
    const defaultTimezone =
      (config?.timezone as string) ?? systemTimezone;

    return {
      name: "datetime",
      tool: tool({
        description:
          "Get the current date and time. Useful for timestamps, scheduling, and time-sensitive queries.",
        inputSchema: z.object({}),
        execute: async () => {
          const tz = defaultTimezone;
          const date = new Date();

          // Build a timezone-aware ISO string using Intl parts
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }).formatToParts(date);

          const p = (type: string) =>
            parts.find((p) => p.type === type)!.value;

          const localIso = `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}`;

          const formatted = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZoneName: "long",
          }).format(date);

          return {
            iso: localIso,
            formatted,
            timezone: tz,
            unix: Math.floor(date.getTime() / 1000),
          };
        },
      }),
    };
  },
});
