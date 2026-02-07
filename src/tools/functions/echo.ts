/**
 * Echo Tool
 * 
 * A simple function tool that echoes back its input.
 * Useful for testing and demonstrating the function tool pattern.
 */

import { z } from "zod";
import type { ToolMetadata, ToolConfig, ToolResult, ToolInput } from "../types";
import { AbstractTool, type ToolInitOptions } from "../base";

/**
 * Echo tool configuration
 */
export interface EchoToolConfig extends ToolConfig {
  /** Prefix to add to echoed messages */
  prefix?: string;
  
  /** Suffix to add to echoed messages */
  suffix?: string;
  
  /** Whether to uppercase the output */
  uppercase?: boolean;
  
  /** Whether to reverse the output */
  reverse?: boolean;
}

/**
 * Echo tool metadata
 */
export const echoToolMetadata: ToolMetadata = {
  name: "echo",
  description:
    "Echoes back the provided message with optional transformations. " +
    "Useful for testing, simple text processing, and demonstrating tool patterns.",
  category: "function",
  version: "1.0.0",
  author: "Pandora",
  tags: ["testing", "text", "utility"],
};

/**
 * Echo Tool class
 */
export class EchoTool extends AbstractTool {
  /**
   * Create a new echo tool
   */
  constructor(options: ToolInitOptions) {
    super(options);
  }
  
  /**
   * Get the input schema
   */
  getInputSchema(): z.ZodSchema<unknown> {
    return z.object({
      message: z
        .string()
        .describe("The message to echo back"),
      prefix: z
        .string()
        .optional()
        .describe("Optional prefix to add to the message"),
      suffix: z
        .string()
        .optional()
        .describe("Optional suffix to add to the message"),
      uppercase: z
        .boolean()
        .optional()
        .describe("Whether to convert to uppercase"),
      reverse: z
        .boolean()
        .optional()
        .describe("Whether to reverse the string"),
    });
  }
  
  /**
   * Execute the echo tool
   */
  async execute(input: ToolInput): Promise<ToolResult> {
    const { params, context } = input;
    const config = this._config as EchoToolConfig;
    
    const message = params.message as string;
    
    if (!message) {
      return {
        content: "Error: No message provided",
        success: false,
        error: "Missing required parameter: message",
      };
    }
    
    const startTime = Date.now();
    
    try {
      let result = message;
      
      // Apply transformations in order
      if (params.prefix || config.prefix) {
        result = `${params.prefix ?? config.prefix}${result}`;
      }
      
      if (params.suffix || config.suffix) {
        result = `${result}${params.suffix ?? config.suffix}`;
      }
      
      if (params.uppercase || config.uppercase) {
        result = result.toUpperCase();
      }
      
      if (params.reverse) {
        result = result.split("").reverse().join("");
      }
      
      const durationMs = Date.now() - startTime;
      
      this.logger.info(`Echo completed in ${durationMs}ms`);
      
      return this.createSuccessResult(result, durationMs);
    } catch (error) {
      return this.createErrorResult(error);
    }
  }
  
  /**
   * Validate echo-specific configuration
   */
  validateConfig(): void {
    super.validateConfig();
    
    const config = this._config as EchoToolConfig;
    
    // Configuration is valid - no specific validation needed
  }
}

/**
 * Create an echo tool instance
 */
export function createEchoTool(config?: EchoToolConfig): EchoTool {
  return new EchoTool({
    metadata: echoToolMetadata,
    config: {
      enabled: true,
      ...config,
    },
  });
}

/**
 * Echo tool module exports
 */
export const echoTool = {
  metadata: echoToolMetadata,
  class: EchoTool,
  factory: createEchoTool,
};
