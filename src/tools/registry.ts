/**
 * Tool Registry
 * 
 * Central registry for managing tool registration, discovery, and retrieval.
 * Provides a single source of truth for all available tools.
 */

import type {
  ToolMetadata,
  ToolConfig,
  ToolDefinition,
  ExtendedTool,
  ToolCategory,
  ToolRegistrationOptions,
} from "./types";
import type { ToolCreationResult } from "./factory";
import { createTool, validateToolConfig } from "./factory";

/**
 * Registry entry containing the tool and its metadata
 */
interface RegistryEntry {
  /** The registered tool */
  tool: ExtendedTool;
  
  /** The tool definition */
  definition: ToolDefinition;
  
  /** Tool metadata */
  metadata: ToolMetadata;
  
  /** Tool configuration */
  config: ToolConfig;
  
  /** Registration timestamp */
  registeredAt: Date;
  
  /** Tags associated with the tool */
  tags: string[];
}

/**
 * Options for registering a tool
 */
export interface RegisterToolOptions {
  /** Tool metadata */
  metadata: ToolMetadata;
  
  /** Tool configuration */
  config: ToolConfig;
  
  /** Factory options */
  options?: Record<string, unknown>;
  
  /** Registration options */
  registration?: ToolRegistrationOptions;
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  /** Whether to allow duplicate tool names */
  allowDuplicates?: boolean;
  
  /** Default tags for unregistered tools */
  defaultTags?: string[];
  
  /** Whether to validate config on registration */
  validateOnRegister?: boolean;
}

/**
 * Tool Registry
 * 
 * Manages tool registration, discovery, and retrieval.
 * Follows the same pattern as the channel and store registries.
 */
export class ToolRegistry {
  /** Internal storage for registered tools */
  private readonly tools: Map<string, RegistryEntry> = new Map();
  
  /** Tools indexed by category */
  private readonly byCategory: Map<ToolCategory, Set<string>> = new Map();
  
  /** Tools indexed by tag */
  private readonly byTag: Map<string, Set<string>> = new Map();
  
  /** Registry configuration */
  private readonly config: Required<RegistryConfig>;
  
  /** Event listeners */
  private readonly listeners: Map<string, Set<(entry: RegistryEntry) => void>> = new Map();
  
  /**
   * Create a new tool registry
   */
  constructor(config: RegistryConfig = {}) {
    this.config = {
      allowDuplicates: config.allowDuplicates ?? false,
      defaultTags: config.defaultTags ?? [],
      validateOnRegister: config.validateOnRegister ?? true,
    };
    
    // Initialize category sets
    for (const category of Object.values(ToolCategory)) {
      this.byCategory.set(category, new Set());
    }
  }
  
  /**
   * Register a new tool
   */
  register(options: RegisterToolOptions): ExtendedTool {
    const { metadata, config, options: factoryOptions, registration } = options;
    const toolName = config.customName ?? metadata.name;
    
    // Check for duplicates
    if (this.tools.has(toolName)) {
      if (!this.config.allowDuplicates && !registration?.override) {
        throw new Error(`Tool "${toolName}" is already registered`);
      }
      
      // Remove existing tool
      this.unregister(toolName);
    }
    
    // Validate configuration
    if (this.config.validateOnRegister) {
      const validation = validateToolConfig(config, metadata);
      if (!validation.valid) {
        throw new Error(
          `Invalid configuration for tool "${toolName}": ${validation.errors.join(", ")}`
        );
      }
    }
    
    // Create the tool
    const creationResult = createTool({
      metadata,
      config,
      options: factoryOptions,
    });
    
    // Create registry entry
    const entry: RegistryEntry = {
      tool: creationResult.tool,
      definition: creationResult.definition,
      metadata,
      config,
      registeredAt: new Date(),
      tags: registration?.tags ?? this.config.defaultTags,
    };
    
    // Store the tool
    this.tools.set(toolName, entry);
    
    // Index by category
    const categorySet = this.byCategory.get(metadata.category);
    if (categorySet) {
      categorySet.add(toolName);
    }
    
    // Index by tags
    for (const tag of entry.tags) {
      let tagSet = this.byTag.get(tag);
      if (!tagSet) {
        tagSet = new Set();
        this.byTag.set(tag, tagSet);
      }
      tagSet.add(toolName);
    }
    
    // Emit registration event
    this.emit("registered", entry);
    
    // Log warnings if any
    for (const warning of creationResult.warnings) {
      console.warn(`[ToolRegistry] ${warning}`);
    }
    
    return creationResult.tool;
  }
  
  /**
   * Unregister a tool by name
   */
  unregister(name: string): boolean {
    const entry = this.tools.get(name);
    if (!entry) {
      return false;
    }
    
    // Remove from main storage
    this.tools.delete(name);
    
    // Remove from category index
    const categorySet = this.byCategory.get(entry.metadata.category);
    if (categorySet) {
      categorySet.delete(name);
    }
    
    // Remove from tag indexes
    for (const tag of entry.tags) {
      const tagSet = this.byTag.get(tag);
      if (tagSet) {
        tagSet.delete(name);
        if (tagSet.size === 0) {
          this.byTag.delete(tag);
        }
      }
    }
    
    // Emit unregistration event
    this.emit("unregistered", entry);
    
    return true;
  }
  
  /**
   * Get a tool by name
   */
  get(name: string): ExtendedTool | undefined {
    return this.tools.get(name)?.tool;
  }
  
  /**
   * Get a tool's definition by name
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }
  
  /**
   * Get a tool's metadata by name
   */
  getMetadata(name: string): ToolMetadata | undefined {
    return this.tools.get(name)?.metadata;
  }
  
  /**
   * Get a tool's configuration by name
   */
  getConfig(name: string): ToolConfig | undefined {
    return this.tools.get(name)?.config;
  }
  
  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
  
  /**
   * Get all registered tool names
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }
  
  /**
   * Get all registered tools
   */
  listTools(): ExtendedTool[] {
    return Array.from(this.tools.values()).map((entry) => entry.tool);
  }
  
  /**
   * Get all tool definitions
   */
  listDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((entry) => entry.definition);
  }
  
  /**
   * Get all tool metadata
   */
  listMetadata(): ToolMetadata[] {
    return Array.from(this.tools.values()).map((entry) => entry.metadata);
  }
  
  /**
   * Get tools by category
   */
  listByCategory(category: ToolCategory): ExtendedTool[] {
    const names = this.byCategory.get(category);
    if (!names) {
      return [];
    }
    
    return Array.from(names)
      .map((name) => this.tools.get(name)?.tool)
      .filter((tool): tool is ExtendedTool => tool !== undefined);
  }
  
  /**
   * Get tools by tag
   */
  listByTag(tag: string): ExtendedTool[] {
    const names = this.byTag.get(tag);
    if (!names) {
      return [];
    }
    
    return Array.from(names)
      .map((name) => this.tools.get(name)?.tool)
      .filter((tool): tool is ExtendedTool => tool !== undefined);
  }
  
  /**
   * Get the count of registered tools
   */
  count(): number {
    return this.tools.size;
  }
  
  /**
   * Get the count of tools by category
   */
  countByCategory(category: ToolCategory): number {
    return this.byCategory.get(category)?.size ?? 0;
  }
  
  /**
   * Get all unique tags
   */
  listTags(): string[] {
    return Array.from(this.byTag.keys());
  }
  
  /**
   * Clear all registered tools
   */
  clear(): void {
    const entries = Array.from(this.tools.values());
    this.tools.clear();
    
    for (const category of this.byCategory.values()) {
      category.clear();
    }
    
    this.byTag.clear();
    
    // Emit clear event
    for (const entry of entries) {
      this.emit("unregistered", entry);
    }
  }
  
  /**
   * Register an event listener
   */
  on(event: "registered" | "unregistered", listener: (entry: RegistryEntry) => void): void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);
  }
  
  /**
   * Remove an event listener
   */
  off(event: "registered" | "unregistered", listener: (entry: RegistryEntry) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }
  
  /**
   * Emit an event
   */
  private emit(event: "registered" | "unregistered", entry: RegistryEntry): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(entry);
        } catch (error) {
          console.error(`[ToolRegistry] Error in ${event} listener:`, error);
        }
      }
    }
  }
  
  /**
   * Create a record of tools for the AI SDK
   */
  toAIDefinition(): Record<string, ExtendedTool> {
    const record: Record<string, ExtendedTool> = {};
    
    for (const [name, entry] of this.tools) {
      record[name] = entry.tool;
    }
    
    return record;
  }
  
  /**
   * Get available tool names for instructions
   */
  getAvailableToolNames(): string[] {
    return this.list().filter((name) => {
      const config = this.getConfig(name);
      return config?.enabled !== false;
    });
  }
  
  /**
   * Serialize the registry state (for debugging/testing)
   */
  toJSON(): object {
    return {
      toolCount: this.tools.size,
      byCategory: Object.fromEntries(
        Array.from(this.byCategory.entries()).map(([category, names]) => [
          category,
          Array.from(names),
        ])
      ),
      byTag: Object.fromEntries(
        Array.from(this.byTag.entries()).map(([tag, names]) => [
          tag,
          Array.from(names),
        ])
      ),
      tools: Array.from(this.tools.entries()).map(([name, entry]) => ({
        name,
        metadata: entry.metadata,
        config: entry.config,
        registeredAt: entry.registeredAt.toISOString(),
        tags: entry.tags,
      })),
    };
  }
}

/**
 * Create a default tool registry with standard configuration
 */
export function createDefaultRegistry(): ToolRegistry {
  return new ToolRegistry({
    allowDuplicates: false,
    validateOnRegister: true,
  });
}
