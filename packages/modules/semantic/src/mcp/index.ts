// ── SEM-10: MCP Module Barrel ─────────────────────────────────────
// Re-exports all MCP tool and resource definitions for the semantic layer.
// External MCP server integrations import from here.

export type {
  McpToolDefinition,
  McpToolHandler,
  McpToolResult,
  McpResourceDefinition,
  McpResourceTemplate,
  McpResourceHandler,
} from './types';

export { SEMANTIC_TOOLS, getToolHandler, getToolDefinitions } from './tools';
export { SEMANTIC_RESOURCES, getResourceHandler, getResourceDefinitions } from './resources';
