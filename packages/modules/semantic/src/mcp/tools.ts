// ── SEM-10: MCP Tool Definitions ──────────────────────────────────
// Exposes semantic layer capabilities as MCP tools that external
// clients (Claude Desktop, VS Code, other agents) can discover and invoke.

import type { McpToolDefinition, McpToolHandler, McpToolResult } from './types';
import { runPipeline } from '../llm/pipeline';
import { listMetrics, listDimensions, listLenses } from '../registry/registry';
import { listCustomLenses } from '../lenses/queries';

// ── Tool schemas ─────────────────────────────────────────────────

export const SEMANTIC_TOOLS: McpToolDefinition[] = [
  {
    name: 'semantic_query',
    description:
      'Ask a natural-language question about business data (sales, revenue, inventory, customers). ' +
      'Returns a narrative answer with supporting data rows, chart suggestions, and follow-up questions. ' +
      'The question is analyzed, compiled into SQL, executed against the tenant database, and narrated by THE OPPS ERA LENS.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Natural language question (max 2000 chars).' },
        sessionId: { type: 'string', description: 'Conversation session ID for multi-turn context.' },
        lensSlug: { type: 'string', description: 'Optional lens slug to scope the analysis (e.g. "golf", "retail").' },
        timezone: { type: 'string', description: 'IANA timezone (default: UTC).' },
      },
      required: ['message', 'sessionId'],
    },
  },
  {
    name: 'list_metrics',
    description:
      'List all available business metrics in the semantic registry. ' +
      'Returns metric slugs, display names, descriptions, formats, and which dimensions they support.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category filter (e.g. "sales", "inventory", "golf").' },
      },
    },
  },
  {
    name: 'list_dimensions',
    description:
      'List all available dimensions (grouping/filtering axes) in the semantic registry. ' +
      'Returns dimension slugs, display names, types, and allowed values.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_lenses',
    description:
      'List available analysis lenses (scoped views like "golf", "retail", "hospitality"). ' +
      'Each lens defines a focused set of metrics and dimensions for a specific business domain.',
    inputSchema: {
      type: 'object',
      properties: {
        includeCustom: { type: 'boolean', description: 'Include tenant-custom lenses (default: true).' },
      },
    },
  },
];

// ── Tool handlers ────────────────────────────────────────────────

const handlers: Record<string, McpToolHandler> = {
  async semantic_query(args, context): Promise<McpToolResult> {
    const message = String(args.message ?? '');
    const sessionId = String(args.sessionId ?? `mcp_${Date.now()}`);
    const lensSlug = args.lensSlug ? String(args.lensSlug) : undefined;
    const timezone = String(args.timezone ?? 'UTC');

    if (!message) {
      return { content: [{ type: 'text', text: 'Error: message is required.' }], isError: true };
    }

    const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: timezone });

    const output = await runPipeline({
      message,
      context: {
        tenantId: context.tenantId,
        userId: context.userId,
        userRole: 'staff',
        sessionId,
        lensSlug,
        currentDate,
        timezone,
      },
    });

    const result: Record<string, unknown> = {
      narrative: output.narrative,
      mode: output.mode,
      rows: output.data?.rows ?? [],
      rowCount: output.data?.rowCount ?? 0,
      isClarification: output.isClarification,
      clarificationText: output.clarificationText,
      suggestedFollowUps: output.suggestedFollowUps ?? [],
      chartConfig: output.chartConfig ?? null,
      compiledSql: output.compiledSql,
      confidence: output.llmConfidence,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async list_metrics(args): Promise<McpToolResult> {
    const category = args.category ? String(args.category).toLowerCase() : null;
    let metrics = await listMetrics();

    if (category) {
      metrics = metrics.filter((m) =>
        m.slug.includes(category) || (m.description ?? '').toLowerCase().includes(category),
      );
    }

    const result = metrics.map((m) => ({
      slug: m.slug,
      displayName: m.displayName,
      description: m.description,
      dataType: m.dataType,
      higherIsBetter: m.higherIsBetter,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async list_dimensions(): Promise<McpToolResult> {
    const dimensions = await listDimensions();

    const result = dimensions.map((d) => ({
      slug: d.slug,
      displayName: d.displayName,
      sqlDataType: d.sqlDataType,
      isTimeDimension: d.isTimeDimension,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },

  async list_lenses(args, context): Promise<McpToolResult> {
    const includeCustom = args.includeCustom !== false;

    // System lenses from registry
    const systemLenses = await listLenses();
    const systemResult = systemLenses.map((l) => ({
      slug: l.slug,
      name: l.displayName,
      description: l.description,
      isSystem: true,
    }));

    // Custom tenant lenses (optional)
    if (includeCustom) {
      const customLenses = await listCustomLenses({ tenantId: context.tenantId });
      const customResult = customLenses.map((l) => ({
        slug: l.slug,
        name: l.displayName,
        description: l.description,
        isSystem: false,
      }));
      return { content: [{ type: 'text', text: JSON.stringify([...systemResult, ...customResult], null, 2) }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify(systemResult, null, 2) }] };
  },
};

/** Get the MCP tool handler for a given tool name. */
export function getToolHandler(toolName: string): McpToolHandler | undefined {
  return handlers[toolName];
}

/** Get all registered MCP tool definitions. */
export function getToolDefinitions(): McpToolDefinition[] {
  return SEMANTIC_TOOLS;
}
