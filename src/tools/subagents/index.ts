/**
 * Subagent Tools Index
 * 
 * Exports all subagent-based tools and related utilities.
 */

export {
  SubagentTool,
  type SubagentToolConfig,
  type SubagentToolInitOptions,
  type SubagentLogger,
  noopSubagentLogger,
  createSubagent,
  setupSubagentTool,
  createSubagentToolClass,
} from "./base";

export {
  CoderTool,
  type CoderToolConfig,
  coderToolMetadata,
  createCoderTool,
  createCoderSubagent,
  coderTool,
} from "./coder";

export {
  ResearchTool,
  type ResearchToolConfig,
  researchToolMetadata,
  createResearchTool,
  createResearchSubagent,
  researchTool,
} from "./research";

/**
 * Registry of all available subagent tools
 */
export const subagentTools = {
  coder: {
    metadata: coderToolMetadata,
    factory: createCoderTool,
    subagentFactory: createCoderSubagent,
  },
  research: {
    metadata: researchToolMetadata,
    factory: createResearchTool,
    subagentFactory: createResearchSubagent,
  },
};

/**
 * Get all subagent tool names
 */
export function getSubagentToolNames(): string[] {
  return Object.keys(subagentTools);
}

/**
 * Get subagent tool metadata by name
 */
export function getSubagentToolMetadata(name: string): typeof subagentTools.coder.metadata | undefined {
  const tool = subagentTools[name as keyof typeof subagentTools];
  return tool?.metadata;
}

/**
 * Create a subagent tool by name
 */
export function createSubagentToolByName(
  name: string,
  config: SubagentToolConfig
): CoderTool | ResearchTool | undefined {
  const tool = subagentTools[name as keyof typeof subagentTools];
  if (!tool) {
    return undefined;
  }
  
  return tool.factory(config) as CoderTool | ResearchTool;
}
