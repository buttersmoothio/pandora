/**
 * Tool Factory
 * 
 * Creates tool instances based on type and configuration.
 * Supports dynamic tool creation with validation and error handling.
 */

import type {
  ToolMetadata,
  ToolConfig,
  ToolDefinition,
  ToolCategory,
  ExtendedTool,
} from "./types";
import { AbstractTool } from "./base";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

// Import subagent tools (will be created in later phases)
import type { SubagentTool } from "./subagents/base";

/**
 * Factory options for creating tools
 */
export interface CreateToolOptions {
  /** Tool metadata */
  metadata: ToolMetadata;
  
  /** Tool configuration */
  config: ToolConfig;
  
  /** Category-specific options */
  options?: Record<string, unknown>;
}

/**
 * Result of tool creation
 */
export interface ToolCreationResult {
  /** The created tool instance */
  tool: ExtendedTool;
  
  /** The tool definition */
  definition: ToolDefinition;
  
  /** Any warnings generated during creation */
  warnings: string[];
}

/**
 * Create a tool based on its category and configuration
 */
export function createTool(
  options: CreateToolOptions
): ToolCreationResult {
  const { metadata, config, options: extraOptions = {} } = options;
  const warnings: string[] = [];
  
  // Check if tool is enabled
  if (config.enabled === false) {
    warnings.push(`Tool "${metadata.name}" is disabled`);
  }
  
  let toolInstance: ExtendedTool;
  let definition: ToolDefinition;
  
  switch (metadata.category) {
    case ToolCategory.Subagent:
      const subagentResult = createSubagentTool(metadata, config, extraOptions);
      toolInstance = subagentResult.tool;
      definition = subagentResult.definition;
      break;
      
    case ToolCategory.Function:
      const functionResult = createFunctionTool(metadata, config, extraOptions);
      toolInstance = functionResult.tool;
      definition = functionResult.definition;
      break;
      
    case ToolCategory.Api:
      const apiResult = createApiTool(metadata, config, extraOptions);
      toolInstance = apiResult.tool;
      definition = apiResult.definition;
      break;
      
    case ToolCategory.Utility:
      const utilityResult = createUtilityTool(metadata, config, extraOptions);
      toolInstance = utilityResult.tool;
      definition = utilityResult.definition;
      break;
      
    default:
      throw new Error(`Unknown tool category: ${(metadata as ToolMetadata).category}`);
  }
  
  return { tool: toolInstance, definition, warnings };
}

/**
 * Create a subagent-based tool
 */
function createSubagentTool(
  metadata: ToolMetadata,
  config: ToolConfig,
  options: Record<string, unknown>
): ToolCreationResult {
  const provider = config.provider ?? "openai";
  const model = config.model ?? "gpt-4o";
  
  // Get subagent from options or create a default one
  const subagent = (options.subagent as ToolLoopAgent) ?? createDefaultSubagent(
    provider,
    model,
    metadata.name
  );
  
  const aiTool = tool({
    description: metadata.description,
    inputSchema: z.object({
      task: z.string().describe("The task to delegate to the subagent"),
    }),
    execute: async ({ task }, { abortSignal }) => {
      const result = await subagent.generate({ prompt: task, abortSignal });
      return result.text;
    },
  });
  
  // Attach metadata to the tool
  const extendedTool = aiTool as ExtendedTool;
  extendedTool.__metadata = metadata;
  
  const definition: ToolDefinition = {
    metadata,
    config,
    inputSchema: aiTool.inputSchema,
    execute: async (input) => {
      const { params, context } = input;
      const task = params.task as string;
      
      try {
        const result = await subagent.generate({
          prompt: task,
          abortSignal: context.abortSignal,
        });
        
        return {
          content: result.text,
          success: true,
        };
      } catch (error) {
        return {
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
  
  extendedTool.__definition = definition;
  
  return {
    tool: extendedTool,
    definition,
    warnings: [],
  };
}

/**
 * Create a function-based tool
 */
function createFunctionTool(
  metadata: ToolMetadata,
  config: ToolConfig,
  options: Record<string, unknown>
): ToolCreationResult {
  const executeFn = (options.execute as ((input: ToolInput) => Promise<{
    content: string | object;
    success: boolean;
    error?: string;
  }>)) ?? defaultFunctionExecutor;
  
  const inputSchema = (options.inputSchema as z.ZodSchema<unknown>) ??
    z.object({});
  
  const aiTool = tool({
    description: metadata.description,
    inputSchema,
    execute: async (params, context) => {
      const result = await executeFn({ params, context });
      return result.content;
    },
  });
  
  const extendedTool = aiTool as ExtendedTool;
  extendedTool.__metadata = metadata;
  
  const definition: ToolDefinition = {
    metadata,
    config,
    inputSchema,
    execute: async (input) => {
      try {
        const result = await executeFn(input);
        return {
          content: result.content,
          success: result.success,
          error: result.error,
        };
      } catch (error) {
        return {
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
  
  extendedTool.__definition = definition;
  
  return {
    tool: extendedTool,
    definition,
    warnings: [],
  };
}

/**
 * Create an API-based tool
 */
function createApiTool(
  metadata: ToolMetadata,
  config: ToolConfig,
  options: Record<string, unknown>
): ToolCreationResult {
  const baseUrl = (options.baseUrl as string) ?? "";
  const defaultHeaders = (options.headers as Record<string, string>) ?? {};
  
  const inputSchema = (options.inputSchema as z.ZodSchema<unknown>) ??
    z.object({
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
      path: z.string().describe("API endpoint path"),
      body: z.unknown().optional().describe("Request body for POST/PUT/PATCH"),
      headers: z.record(z.string()).optional().describe("Additional headers"),
    });
  
  const aiTool = tool({
    description: metadata.description,
    inputSchema,
    execute: async (params, context) => {
      // API execution would be implemented here
      return `API call to ${params.method} ${params.path}`;
    },
  });
  
  const extendedTool = aiTool as ExtendedTool;
  extendedTool.__metadata = metadata;
  
  const definition: ToolDefinition = {
    metadata,
    config,
    inputSchema,
    execute: async (input) => {
      // Placeholder for API execution
      return {
        content: `API tool "${metadata.name}" - execution not implemented`,
        success: true,
      };
    },
  };
  
  extendedTool.__definition = definition;
  
  return {
    tool: extendedTool,
    definition,
    warnings: ["API tool execution not yet implemented"],
  };
}

/**
 * Create a utility tool
 */
function createUtilityTool(
  metadata: ToolMetadata,
  config: ToolConfig,
  options: Record<string, unknown>
): ToolCreationResult {
  const executeFn = (options.execute as ((input: ToolInput) => Promise<{
    content: string | object;
    success: boolean;
    error?: string;
  }>)) ?? defaultFunctionExecutor;
  
  const inputSchema = (options.inputSchema as z.ZodSchema<unknown>) ??
    z.object({});
  
  const aiTool = tool({
    description: metadata.description,
    inputSchema,
    execute: async (params, context) => {
      const result = await executeFn({ params, context });
      return result.content;
    },
  });
  
  const extendedTool = aiTool as ExtendedTool;
  extendedTool.__metadata = metadata;
  
  const definition: ToolDefinition = {
    metadata,
    config,
    inputSchema,
    execute: async (input) => {
      try {
        const result = await executeFn(input);
        return {
          content: result.content,
          success: result.success,
          error: result.error,
        };
      } catch (error) {
        return {
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  };
  
  extendedTool.__definition = definition;
  
  return {
    tool: extendedTool,
    definition,
    warnings: [],
  };
}

/**
 * Create a default subagent for tool delegation
 */
function createDefaultSubagent(
  provider: string,
  model: string,
  name: string
): ToolLoopAgent {
  // This is a placeholder - the actual implementation would create
  // a proper subagent with the appropriate provider and model
  return new ToolLoopAgent({
    model: {
      provider: {
        providerName: provider,
        defaultApiKeyName: "apiKey",
      },
      modelId: model,
    } as any,
    instructions: `You are a ${name} specialist. Help with ${name}-related tasks.`,
    tools: {},
  });
}

/**
 * Default function executor for simple function tools
 */
async function defaultFunctionExecutor(input: {
  params: Record<string, unknown>;
  context: { abortSignal?: AbortSignal };
}): Promise<{ content: string | object; success: boolean; error?: string }> {
  return {
    content: `Function executed with params: ${JSON.stringify(input.params)}`,
    success: true,
  };
}

/**
 * Validate tool configuration
 */
export function validateToolConfig(
  config: ToolConfig,
  metadata: ToolMetadata
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check required fields
  if (typeof config.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  
  // Category-specific validation
  switch (metadata.category) {
    case ToolCategory.Subagent:
      if (!config.provider && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
        errors.push("Subagent tools require a provider configuration or API key environment variable");
      }
      break;
      
    case ToolCategory.Api:
      if (!config.provider) {
        errors.push("API tools require a provider configuration");
      }
      break;
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create multiple tools from a list of configurations
 */
export function createTools(
  configurations: Array<CreateToolOptions>
): Map<string, ToolCreationResult> {
  const results = new Map<string, ToolCreationResult>();
  const warnings: string[] = [];
  
  for (const config of configurations) {
    try {
      const result = createTool(config);
      const toolName = config.config.customName ?? config.metadata.name;
      
      if (results.has(toolName)) {
        warnings.push(`Duplicate tool name: "${toolName}" - last instance will be used`);
      }
      
      results.set(toolName, result);
    } catch (error) {
      warnings.push(
        `Failed to create tool "${config.metadata.name}": ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  
  // Log warnings
  for (const warning of warnings) {
    console.warn(`[ToolFactory] ${warning}`);
  }
  
  return results;
}
