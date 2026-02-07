/**
 * Tool Loader
 * 
 * Discovers and loads tools from the file system.
 * Supports dynamic module loading and auto-registration.
 */

import type {
  ToolMetadata,
  ToolConfig,
  DiscoveredTool,
} from "./types";
import type { ToolRegistry } from "./registry";
import { ToolCategory } from "./types";
import { stat, readdir, mkdir } from "fs/promises";
import { join, relative } from "path";

/**
 * Loader configuration
 */
export interface ToolLoaderConfig {
  /** Directories to search for tools */
  toolDirectories: string[];
  
  /** Whether to auto-register discovered tools */
  autoRegister?: boolean;
  
  /** Registry to register tools to (if autoRegister is true) */
  registry?: ToolRegistry;
  
  /** File patterns to ignore */
  ignorePatterns?: string[];
  
  /** Maximum depth for directory traversal */
  maxDepth?: number;
}

/**
 * Loader result
 */
export interface LoaderResult {
  /** Successfully loaded tools */
  loaded: DiscoveredTool[];
  
  /** Tools that failed to load */
  failed: Array<{
    path: string;
    error: string;
  }>;
  
  /** Total files scanned */
  filesScanned: number;
}

/**
 * Default ignore patterns for tool discovery
 */
const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "*.test.ts",
  "*.test.js",
  "*.spec.ts",
  "*.spec.js",
  "*.d.ts",
  "index.ts",
  "index.js",
];

/**
 * Tool Loader
 * 
 * Discovers tools from the file system and optionally registers them.
 */
export class ToolLoader {
  /** Loader configuration */
  private readonly config: Required<ToolLoaderConfig>;
  
  /**
   * Create a new tool loader
   */
  constructor(config: ToolLoaderConfig) {
    this.config = {
      toolDirectories: config.toolDirectories,
      autoRegister: config.autoRegister ?? false,
      registry: config.registry,
      ignorePatterns: config.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
      maxDepth: config.maxDepth ?? 3,
    };
  }
  
  /**
   * Discover and load tools from configured directories
   */
  async load(): Promise<LoaderResult> {
    const result: LoaderResult = {
      loaded: [],
      failed: [],
      filesScanned: 0,
    };
    
    for (const directory of this.config.toolDirectories) {
      try {
        const dirResult = await this.loadFromDirectory(directory, 0);
        result.loaded.push(...dirResult.loaded);
        result.failed.push(...dirResult.failed);
        result.filesScanned += dirResult.filesScanned;
      } catch (error) {
        result.failed.push({
          path: directory,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    // Auto-register tools if configured
    if (this.config.autoRegister && this.config.registry) {
      for (const tool of result.loaded) {
        try {
          this.registerTool(tool);
        } catch (error) {
          result.failed.push({
            path: tool.path,
            error: `Registration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          });
        }
      }
    }
    
    return result;
  }
  
  /**
   * Load tools from a specific directory
   */
  async loadFromDirectory(
    directory: string,
    depth: number
  ): Promise<LoaderResult> {
    const result: LoaderResult = {
      loaded: [],
      failed: [],
      filesScanned: 0,
    };
    
    // Check if we should stop descending
    if (depth >= this.config.maxDepth) {
      return result;
    }
    
    // Check if directory exists
    try {
      const dirStat = await stat(directory);
      if (!dirStat.isDirectory()) {
        return result;
      }
    } catch {
      // Directory doesn't exist
      return result;
    }
    
    // Read directory contents
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      result.failed.push({
        path: directory,
        error: `Failed to read directory: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      return result;
    }
    
    for (const entry of entries) {
      // Check if entry should be ignored
      if (this.shouldIgnore(entry)) {
        continue;
      }
      
      const fullPath = join(directory, entry);
      
      try {
        const entryStat = await stat(fullPath);
        
        if (entryStat.isDirectory()) {
          // Recursively search subdirectories
          const subResult = await this.loadFromDirectory(fullPath, depth + 1);
          result.loaded.push(...subResult.loaded);
          result.failed.push(...subResult.failed);
          result.filesScanned += subResult.filesScanned;
        } else if (entryStat.isFile() && this.isToolFile(entry)) {
          // Try to load as a tool
          result.filesScanned++;
          
          try {
            const tool = await this.loadTool(fullPath);
            if (tool) {
              result.loaded.push(tool);
            }
          } catch (error) {
            result.failed.push({
              path: fullPath,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      } catch (error) {
        result.failed.push({
          path: fullPath,
          error: `Failed to stat: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }
    
    return result;
  }
  
  /**
   * Load a single tool from a file
   */
  async loadTool(path: string): Promise<DiscoveredTool | null> {
    // Dynamic import of the module
    const module = await import(path);
    
    // Look for tool exports
    const metadata = this.extractMetadata(module, path);
    if (!metadata) {
      return null;
    }
    
    return {
      path,
      metadata,
      module,
    };
  }
  
  /**
   * Extract metadata from a module
   */
  private extractMetadata(module: Record<string, unknown>, path: string): ToolMetadata | null {
    // Check for various metadata export patterns
    const metadata =
      (module.toolMetadata as ToolMetadata) ||
      (module.metadata as ToolMetadata) ||
      (module as unknown as { default: ToolMetadata }).default?.toolMetadata ||
      (module as unknown as { default: ToolMetadata }).default?.metadata;
    
    if (metadata) {
      // Validate required fields
      if (!metadata.name || !metadata.description) {
        throw new Error(`Tool at ${path} is missing required metadata (name or description)`);
      }
      
      // Set default category if not provided
      if (!metadata.category) {
        metadata.category = ToolCategory.Utility;
      }
      
      return metadata;
    }
    
    // Check for class-based tool
    const ToolClass = (module.tool as new () => unknown) ||
      (module.default as new () => unknown);
    
    if (ToolClass) {
      try {
        const instance = new ToolClass();
        
        // Try to get metadata from instance
        const instanceMetadata = (instance as { metadata?: ToolMetadata }).metadata;
        if (instanceMetadata) {
          return instanceMetadata;
        }
        
        // Try to get name and description from class
        const name = (instance as { name?: string }).name ||
          (ToolClass as { name?: string }).name;
        
        if (name) {
          return {
            name,
            description: (instance as { description?: string }).description ||
              `Tool: ${name}`,
            category: ToolCategory.Utility,
          };
        }
      } catch {
        // Not a valid tool class
      }
    }
    
    return null;
  }
  
  /**
   * Register a discovered tool to the registry
   */
  private registerTool(tool: DiscoveredTool): void {
    if (!this.config.registry) {
      throw new Error("No registry configured for auto-registration");
    }
    
    // Get config from module if available
    const config = (tool.module.toolConfig as ToolConfig) ||
      (tool.module.config as ToolConfig) || {
        enabled: true,
      };
    
    // Register the tool
    this.config.registry.register({
      metadata: tool.metadata,
      config: {
        enabled: true,
        ...config,
      },
      options: {
        module: tool.module,
      },
    });
  }
  
  /**
   * Check if a file should be ignored
   */
  private shouldIgnore(entry: string): boolean {
    for (const pattern of this.config.ignorePatterns) {
      if (pattern.startsWith("*")) {
        // Wildcard pattern
        if (entry.endsWith(pattern.slice(1))) {
          return true;
        }
      } else if (pattern.startsWith(".")) {
        // Hidden file/directory
        if (entry.startsWith(pattern)) {
          return true;
        }
      } else if (entry === pattern) {
        // Exact match
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if a file is a valid tool file
   */
  private isToolFile(filename: string): boolean {
    return (
      filename.endsWith(".ts") ||
      filename.endsWith(".js") ||
      filename.endsWith(".mjs") ||
      filename.endsWith(".cjs")
    ) && !filename.endsWith(".d.ts");
  }
  
  /**
   * Add an ignore pattern
   */
  addIgnorePattern(pattern: string): void {
    this.config.ignorePatterns.push(pattern);
  }
  
  /**
   * Add a tool directory to search
   */
  addToolDirectory(directory: string): void {
    this.config.toolDirectories.push(directory);
  }
}

/**
 * Create a default tool loader with common directories
 */
export function createDefaultLoader(
  registry?: ToolRegistry,
  basePath?: string
): ToolLoader {
  const directories = basePath
    ? [
        `${basePath}/src/tools`,
        `${basePath}/tools`,
      ]
    : [
        "./src/tools",
        "./tools",
      ];
  
  return new ToolLoader({
    toolDirectories: directories,
    autoRegister: true,
    registry,
  });
}

/**
 * Scan for tools in a directory (one-time discovery)
 */
export async function scanForTools(
  directory: string,
  options?: {
    ignorePatterns?: string[];
    maxDepth?: number;
  }
): Promise<DiscoveredTool[]> {
  const loader = new ToolLoader({
    toolDirectories: [directory],
    autoRegister: false,
    ignorePatterns: options?.ignorePatterns,
    maxDepth: options?.maxDepth,
  });
  
  const result = await loader.load();
  
  // Filter out failed tools from the result
  return result.loaded;
}

/**
 * Validate a tool directory structure
 */
export async function validateToolDirectory(
  directory: string
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  tools: DiscoveredTool[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    const dirStat = await stat(directory);
    if (!dirStat.isDirectory()) {
      errors.push(`${directory} is not a directory`);
      return { valid: false, errors, warnings, tools: [] };
    }
  } catch {
    errors.push(`Directory ${directory} does not exist`);
    return { valid: false, errors, warnings, tools: [] };
  }
  
  const tools = await scanForTools(directory);
  
  for (const tool of tools) {
    if (!tool.metadata.name) {
      errors.push(`${tool.path}: Missing tool name`);
    }
    if (!tool.metadata.description) {
      warnings.push(`${tool.path}: Missing tool description`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    tools,
  };
}

/**
 * Ensure tool directories exist
 */
export async function ensureToolDirectories(
  directories: string[]
): Promise<void> {
  for (const directory of directories) {
    try {
      await mkdir(directory, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}
