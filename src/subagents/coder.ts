/**
 * Coder Subagent - Specialized agent for programming tasks
 *
 * Handles coding tasks including:
 * - Debugging and fixing code
 * - Code review and suggestions
 * - Writing new code
 * - Explaining code concepts
 */

import { z } from "zod";
import { defineSubagent } from "../core/registries/subagents";

export default defineSubagent({
  name: "coder",
  configKey: "coder",

  instructions: `You are an expert programmer. Help with coding tasks including:
- Debugging and fixing code
- Code review and suggestions
- Writing new code
- Explaining code concepts

When finished, provide a clear summary of what you did or found.`,

  toolDescription:
    "Delegate coding tasks: debugging, code review, implementation, code explanations",

  inputSchema: z.object({
    task: z.string().describe("The coding task to complete"),
  }),

  inputField: "task",
});
