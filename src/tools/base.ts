/**
 * Base Tool Class
 * 
 * Abstract base class that all tools must extend.
 * Provides common functionality and interface for tool implementations.
 */

import { z } from "zod";
import type {
  ToolMetadata,
  ToolConfig,
  ToolResult,
  ToolInput,
  ToolCategory,
} from "./types";

/**
 * Logger interface for tool execution logging
 */
export interface ToolLogger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

/**
 * Default no-op logger for tools that don't require logging
 */
export const noopLogger: ToolLogger = {
  info: () => {},
  error: () => {},
  debug: () => {},
  warn: () => {},
};

/**
 * Base configuration schema that all tool configs should extend
 */
export const baseToolConfigSchema = z.object({
  enabled: z.boolean().default(true),
  customName: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

/**
 * Context passed to all tools during execution
 */
export interface BaseToolContext {
  /** Logger instance for the tool */
  logger: ToolLogger;
  
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  
  /** Configuration passed to the tool */
  config: ToolConfig;
  
  /** Global variables that may be needed */
  variables?: Record<string, unknown>;
}

/**
 * Options for initializing a tool
 */
export interface ToolInitOptions {
  /** Tool metadata */
  metadata: ToolMetadata;
  
  /** Tool configuration */
  config: ToolConfig;
  
  /** Logger instance */
  logger?: ToolLogger;
}

/**
 * Abstract base class for all tools
 */
export abstract class AbstractTool {
  /** Tool metadata */
  protected readonly _metadata: ToolMetadata;
  
  /** Tool configuration */
  protected readonly _config: ToolConfig;
  
  /** Logger instance */
  protected readonly logger: ToolLogger;
  
  /**
   * Create a new tool instance
   */
  constructor(options: ToolInitOptions) {
    this._metadata = options.metadata;
    this._config = options.config;
    this.logger = options.logger ?? noopLogger;
    
    // Validate config on creation
    this.validateConfig();
  }
  
  /**
   * Get the tool's metadata
   */
  get metadata(): ToolMetadata {
    return this._metadata;
  }
  
  /**
   * Get the tool's configuration
   */
  get config(): ToolConfig {
    return this._config;
  }
  
  /**
   * Get the tool's category
   */
  get category(): ToolCategory {
    return this._metadata.category;
  }
  
  /**
   * Get the tool's name (respects custom name from config)
   */
  get name(): string {
    return this._config.customName ?? this._metadata.name;
  }
  
  /**
   * Check if the tool is enabled
   */
  get isEnabled(): boolean {
    return this._config.enabled !== false;
  }
  
  /**
   * Abstract method to execute the tool
   * Must be implemented by subclasses
   */
  abstract execute(input: ToolInput): Promise<ToolResult>;
  
  /**
   * Validate the tool's configuration
   * Override this in subclasses to add additional validation
   */
  validateConfig(): void {
    const result = baseToolConfigSchema.safeParse(this._config);
    if (!result.success) {
      throw new Error(
        `Invalid tool configuration for "${this._metadata.name}": ${result.error.message}`
      );
    }
  }
  
  /**
   * Get the input schema for the tool
   * Override this in subclasses to define custom input schema
   */
  getInputSchema(): z.ZodSchema<unknown> {
    return z.object({
      // Default empty schema - subclasses should override
    });
  }
  
  /**
   * Get the description for the AI model
   */
  getDescription(): string {
    return this._metadata.description;
  }
  
  /**
   * Create a standardized error result
   */
  protected createErrorResult(error: string | Error): ToolResult {
    const message = error instanceof Error ? error.message : error;
    return {
      content: `Error: ${message}`,
      success: false,
      error: message,
    };
  }
  
  /**
   * Create a successful result
   */
  protected createSuccessResult(
    content: string | object,
    durationMs?: number
  ): ToolResult {
    return {
      content,
      success: true,
      durationMs,
    };
  }
  
  /**
   * Execute with timing and error handling
   */
  protected async executeWithTiming<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; durationMs: number }> {
    const startTime = Date.now();
    try {
      const result = await fn();
      return { result, durationMs: Date.now() - startTime };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw {
        error,
        durationMs: duration,
      };
    }
  }
}

/**
 * Utility function to create a tool definition from an AbstractTool instance
 */
export function createToolDefinition(tool: AbstractTool) {
  return {
    description: tool.getDescription(),
    inputSchema: tool.getInputSchema(),
    execute: tool.execute.bind(tool),
    __metadata: tool.metadata,
  };
}
