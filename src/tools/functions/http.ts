/**
 * HTTP Tool
 * 
 * A template for making HTTP requests.
 * Demonstrates how to create API-based tools.
 */

import { z } from "zod";
import type { ToolMetadata, ToolConfig, ToolResult, ToolInput } from "../types";
import { AbstractTool, type ToolInitOptions } from "../base";

/**
 * HTTP tool configuration
 */
export interface HttpToolConfig extends ToolConfig {
  /** Base URL for requests */
  baseUrl?: string;
  
  /** Default headers for all requests */
  defaultHeaders?: Record<string, string>;
  
  /** Default timeout in milliseconds */
  timeout?: number;
}

/**
 * HTTP method type
 */
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

/**
 * HTTP request parameters
 */
interface HttpRequestParams {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/**
 * HTTP response
 */
interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * HTTP tool metadata
 */
export const httpToolMetadata: ToolMetadata = {
  name: "http",
  description:
    "Makes HTTP requests to specified URLs. Supports all standard HTTP methods, " +
    "custom headers, and request bodies. Useful for interacting with APIs and " +
    "fetching data from web services.",
  category: "api",
  version: "1.0.0",
  author: "Pandora",
  tags: ["http", "api", "network", "fetch"],
};

/**
 * HTTP Tool class
 */
export class HttpTool extends AbstractTool {
  /**
   * Create a new HTTP tool
   */
  constructor(options: ToolInitOptions) {
    super(options);
  }
  
  /**
   * Get the input schema
   */
  getInputSchema(): z.ZodSchema<unknown> {
    return z.object({
      method: z
        .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
        .default("GET")
        .describe("The HTTP method to use"),
      url: z
        .string()
        .describe("The URL to make the request to"),
      headers: z
        .record(z.string())
        .optional()
        .describe("Optional headers to include with the request"),
      body: z
        .unknown()
        .optional()
        .describe("Optional request body for POST, PUT, PATCH methods"),
      timeout: z
        .number()
        .optional()
        .describe("Optional timeout in milliseconds"),
    });
  }
  
  /**
   * Execute the HTTP tool
   */
  async execute(input: ToolInput): Promise<ToolResult> {
    const { params, context } = input;
    const config = this._config as HttpToolConfig;
    
    const method = params.method as HttpMethod;
    let url = params.url as string;
    const headers = params.headers as Record<string, string> | undefined;
    const body = params.body;
    const timeout = (params.timeout as number | undefined) ?? config.timeout ?? 30000;
    
    if (!url) {
      return {
        content: "Error: No URL provided",
        success: false,
        error: "Missing required parameter: url",
      };
    }
    
    const startTime = Date.now();
    
    try {
      // Build request options
      const requestOptions: RequestInit = {
        method,
        headers: {
          ...config.defaultHeaders,
          ...headers,
          "Content-Type": "application/json",
        },
        signal: context.abortSignal,
      };
      
      // Add body for methods that support it
      if (body && ["POST", "PUT", "PATCH"].includes(method)) {
        requestOptions.body = JSON.stringify(body);
      }
      
      // Make the request
      const response = await this.makeRequest(url, requestOptions, timeout);
      
      const durationMs = Date.now() - startTime;
      
      this.logger.info(`HTTP ${method} ${url} completed in ${durationMs}ms`, {
        status: response.status,
        bodySize: JSON.stringify(response.body).length,
      });
      
      return this.createSuccessResult(
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.body,
        },
        durationMs
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      this.logger.error(`HTTP request failed: ${error}`);
      
      return {
        content: `HTTP request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs,
      };
    }
  }
  
  /**
   * Make an HTTP request (can be overridden for custom implementations)
   */
  protected async makeRequest(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<HttpResponse> {
    // Add timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal ?? controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Parse response
      const contentType = response.headers.get("content-type") ?? "";
      let body: unknown;
      
      if (contentType.includes("application/json")) {
        body = await response.json();
      } else if (contentType.includes("text/")) {
        body = await response.text();
      } else {
        body = await response.text();
      }
      
      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      
      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  /**
   * Validate HTTP-specific configuration
   */
  validateConfig(): void {
    super.validateConfig();
    
    const config = this._config as HttpToolConfig;
    
    if (config.baseUrl) {
      try {
        new URL(config.baseUrl);
      } catch {
        throw new Error("baseUrl must be a valid URL");
      }
    }
    
    if (config.timeout !== undefined && config.timeout < 0) {
      throw new Error("timeout must be a positive number");
    }
  }
}

/**
 * Create an HTTP tool instance
 */
export function createHttpTool(config?: HttpToolConfig): HttpTool {
  return new HttpTool({
    metadata: httpToolMetadata,
    config: {
      enabled: true,
      timeout: 30000,
      ...config,
    },
  });
}

/**
 * HTTP tool module exports
 */
export const httpTool = {
  metadata: httpToolMetadata,
  class: HttpTool,
  factory: createHttpTool,
};
