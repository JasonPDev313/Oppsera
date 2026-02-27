// ── SEM-10: MCP Resource Exposure — Type definitions ─────────────
// Typed interface for exposing the semantic layer via Model Context Protocol.
// These types are framework-agnostic: any MCP server implementation
// (e.g. @modelcontextprotocol/sdk) can import and register them.

/** MCP tool definition — JSON Schema based. */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** MCP resource definition — URI-based. */
export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** MCP resource template for parameterized URIs. */
export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

/** Result of an MCP tool call. */
export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Handler for an MCP tool call. */
export type McpToolHandler = (
  args: Record<string, unknown>,
  context: { tenantId: string; userId: string },
) => Promise<McpToolResult>;

/** Handler for an MCP resource read. */
export type McpResourceHandler = (
  uri: string,
  context: { tenantId: string },
) => Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;
