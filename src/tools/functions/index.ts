/**
 * Function Tools Index
 * 
 * Exports all function-based tools and related utilities.
 */

export {
  EchoTool,
  type EchoToolConfig,
  echoToolMetadata,
  createEchoTool,
  echoTool,
} from "./echo";

export {
  HttpTool,
  type HttpToolConfig,
  httpToolMetadata,
  createHttpTool,
  httpTool,
} from "./http";

/**
 * Registry of all available function tools
 */
export const functionTools = {
  echo: {
    metadata: echoToolMetadata,
    factory: createEchoTool,
  },
  http: {
    metadata: httpToolMetadata,
    factory: createHttpTool,
  },
};

/**
 * Get all function tool names
 */
export function getFunctionToolNames(): string[] {
  return Object.keys(functionTools);
}

/**
 * Get function tool metadata by name
 */
export function getFunctionToolMetadata(
  name: string
): typeof functionTools.echo.metadata | undefined {
  const tool = functionTools[name as keyof typeof functionTools];
  return tool?.metadata;
}

/**
 * Create a function tool by name
 */
export function createFunctionToolByName(
  name: string,
  config?: ToolConfig
): EchoTool | HttpTool | undefined {
  const tool = functionTools[name as keyof typeof functionTools];
  if (!tool) {
    return undefined;
  }
  
  return tool.factory(config) as EchoTool | HttpTool;
}
