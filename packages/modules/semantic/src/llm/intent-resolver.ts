import type { LLMAdapter, LLMMessage, IntentContext, ResolvedIntent, PipelineMode } from './types';
import { LLMError } from './types';
import type { QueryPlan } from '../compiler/types';
import type { RegistryCatalog, MetricDef, DimensionDef } from '../registry/types';
import type { EvalExample } from '../evaluation/types';
import { getLLMAdapter } from './adapters/anthropic';
import { pruneForIntentResolver } from './conversation-pruner';
import { retrieveFewShotExamples } from '../rag/few-shot-retriever';

// ── System prompt builder ─────────────────────────────────────────
// Constructs the intent-resolution prompt from:
//  1. Role + output contract
//  2. Registry catalog (metrics + dimensions available)
//  3. Lens-specific context (if active)
//  4. Current date + tenant context
//  5. Golden examples (few-shot, if provided)

function buildCatalogSnippet(catalog: RegistryCatalog): string {
  const metrics = catalog.metrics.map((m: MetricDef) => {
    const meta: string[] = [];
    if (m.unit) meta.push(m.unit);
    if (m.sqlTable) meta.push(`from ${m.sqlTable}`);
    if (m.dataType) meta.push(m.dataType);
    const metaSuffix = meta.length > 0 ? ` [${meta.join(', ')}]` : '';
    return `  - ${m.slug}: ${m.displayName}${m.description ? ` — ${m.description}` : ''}${metaSuffix}`;
  }).join('\n');

  const dimensions = catalog.dimensions.map((d: DimensionDef) => {
    const meta: string[] = [];
    if (d.sqlTable) meta.push(`from ${d.sqlTable}`);
    if (d.sqlTable?.startsWith('rm_inventory')) meta.push('SNAPSHOT');
    else if (d.sqlTable?.startsWith('rm_customer')) meta.push('RUNNING TOTAL');
    else if (d.isTimeDimension) meta.push('time');
    const metaSuffix = meta.length > 0 ? ` [${meta.join(', ')}]` : '';
    return `  - ${d.slug}: ${d.displayName}${d.description ? ` — ${d.description}` : ''}${metaSuffix}`;
  }).join('\n');

  return `## Available Metrics\n${metrics}\n\n## Available Dimensions\n${dimensions}`;
}

function buildMetricDimensionCompatibility(catalog: RegistryCatalog): string {
  // Group metrics by source table for compatibility hints
  const groups = new Map<string, { metrics: string[]; dims: string[] }>();
  for (const m of catalog.metrics) {
    const table = m.sqlTable;
    if (!groups.has(table)) groups.set(table, { metrics: [], dims: [] });
    groups.get(table)!.metrics.push(m.slug);
  }
  for (const d of catalog.dimensions) {
    const table = d.sqlTable;
    if (groups.has(table)) {
      const g = groups.get(table)!;
      if (!g.dims.includes(d.slug)) g.dims.push(d.slug);
    }
  }

  const lines: string[] = ['## Metric-Dimension Compatibility'];
  const labels: Record<string, string> = {
    rm_daily_sales: 'Daily Sales',
    rm_item_sales: 'Item Sales',
    rm_inventory_on_hand: 'Inventory Snapshot (NO date)',
    rm_customer_activity: 'Customer Running Totals (NO date)',
    rm_golf_daily_revenue: 'Golf Revenue',
    rm_golf_utilization: 'Golf Utilization',
    rm_golf_pace_daily: 'Golf Pace of Play',
    rm_golf_channel_daily: 'Golf Channels',
    rm_golf_daypart_revenue: 'Golf Daypart',
  };

  for (const [table, group] of groups) {
    if (group.metrics.length === 0) continue;
    const label = labels[table] ?? table;
    const noDate = table.includes('inventory') || table.includes('customer');
    lines.push(`- **${label}** (${table})${noDate ? ' — NO date dimension' : ''}: dims=[${group.dims.join(', ')}], metrics=[${group.metrics.join(', ')}]`);
  }
  lines.push('');
  lines.push('Do NOT mix metrics from different groups in a single query. If the user asks about both sales and inventory, pick the most relevant group.');

  return lines.join('\n');
}

function buildExamplesSnippet(examples: EvalExample[]): string {
  if (examples.length === 0) return '';

  const lines = examples.slice(0, 6).map((ex) => {
    const plan = JSON.stringify(ex.plan, null, 2);
    return `### Example\nQuestion: "${ex.question}"\nPlan:\n\`\`\`json\n${plan}\n\`\`\``;
  });

  return `## Golden Examples\nStudy these to understand the expected plan structure:\n\n${lines.join('\n\n')}`;
}

function buildSystemPrompt(
  catalog: RegistryCatalog,
  context: IntentContext,
  examples: EvalExample[],
  lensPromptFragment?: string | null,
  schemaSummary?: string | null,
): string {
  const catalogSection = buildCatalogSnippet(catalog);
  const examplesSection = buildExamplesSnippet(examples);
  const lensSection = lensPromptFragment
    ? `## Active Lens Context\n${lensPromptFragment}\n`
    : '';

  const schemaSection = schemaSummary
    ? `\n## Full Database Tables (for SQL mode routing)\nThe tenant database also contains these tables that can be queried directly via SQL mode:\n${schemaSummary}\n`
    : '';

  const compatSection = buildMetricDimensionCompatibility(catalog);

  return `You are the intent-resolution engine for OppsEra, a business analytics platform for hospitality and retail operators.

Your job: translate a user's natural-language question into a structured query plan, AND decide which execution mode to use.

## Output Contract
Respond with a single JSON object — no markdown fences, no prose before/after. Schema:
\`\`\`
{
  "mode": "metrics" | "sql",     // "metrics" for analytics via pre-defined metrics, "sql" for direct database queries
  "plan": {
    "metrics": string[],          // slugs from Available Metrics (only for mode="metrics")
    "dimensions": string[],       // slugs from Available Dimensions (only for mode="metrics")
    "filters": [                  // optional filters (only for mode="metrics")
      { "dimensionSlug": string, "operator": "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"nin"|"between"|"like"|"is_null"|"is_not_null",
        "value"?: string|number,
        "values"?: (string|number)[],
        "rangeStart"?: string, "rangeEnd"?: string }
    ],
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
    "timeGranularity": "day"|"week"|"month"|"quarter"|"year" | null,
    "sort": [{ "metricSlug": string, "direction": "asc"|"desc" }] | null,
    "limit": number | null,
    "lensSlug": string | null,
    "intent": string,             // 1-sentence description of what user wants
    "rationale": string           // brief explanation of choices made
  } | null,
  "confidence": number,           // 0.0–1.0, your certainty the plan is correct
  "clarificationNeeded": boolean, // true if you cannot resolve without more info
  "clarificationMessage": string | null  // the question to ask the user (if clarificationNeeded)
}
\`\`\`

## Mode Routing Rules
- Use **mode="metrics"** when the question is about sales analytics, revenue, order counts, item performance, inventory KPIs, or any topic that maps cleanly to the Available Metrics below. This mode is faster and more reliable for these queries.
- Use **mode="sql"** when the question is about specific records, data exploration, operational details, entity lookups, configuration, or anything NOT covered by the Available Metrics. Examples: "how many users do I have", "list my vendors", "which catalog items have no inventory", "show me orders from customer X", "what tables need setup".
- **Also use mode="sql"** when the question involves period comparisons ("compare to last week", "vs previous month", "week over week") — SQL mode handles CTEs for multi-period comparison better than metrics mode.
- When in doubt, prefer **mode="sql"** — it can answer any question about the database.
- For mode="sql", still fill in the plan with "intent" and "rationale" fields (metrics/dimensions can be empty arrays).

## Data Dictionary — Critical Rules

### Money Conventions
- Metrics from rm_daily_sales and rm_item_sales are already in DOLLARS (no conversion needed)
- Metrics from rm_customer_activity total_spend is in DOLLARS
- If you route to SQL mode: orders/tenders tables store amounts in CENTS (divide by 100 for dollars)
- catalog_items, GL, AP, AR tables store amounts in DOLLARS

### Data Source Types
- rm_daily_sales: Pre-aggregated DAILY totals per location. Can group by date + location only. Cannot filter by individual item or customer.
- rm_item_sales: Pre-aggregated by item + date + location + category. Use for item-level and category-level breakdowns.
- rm_inventory_on_hand: SNAPSHOT (point-in-time, not time-series). Do NOT add date dimensions or date ranges for inventory metrics.
- rm_customer_activity: RUNNING TOTALS per customer (not time-series). Do NOT add date dimensions for customer metrics.

### Date Conventions
- "business_date" is the operational date — events after midnight may belong to the previous business day
- Use business_date (not created_at) for date filtering on sales/order metrics

### Table Distinctions
- "users" = Staff/employees who WORK at the business (name, email, role). "customers" = People who BUY from the business (first_name, last_name, display_name).
- These are COMPLETELY DIFFERENT tables. "How many users?" → SQL query users. "How many customers?" → SQL query customers. NEVER confuse them.

### Status Filters
- Active orders: status IN ('placed', 'paid'). Voided orders: status = 'voided'.
- Active catalog items: archived_at IS NULL (not a boolean flag).
- Active vendors: is_active = true.
- Inventory on-hand = SUM(quantity_delta) from inventory_movements. Never a stored column.

## Rules
1. Only use metric/dimension slugs from the lists below. Never invent slugs.
2. If the user's question is ambiguous but answerable with reasonable assumptions, make the best plan and set confidence < 0.8.
3. **Bias toward attempting a query.** If the question is ambiguous, make your best attempt with reasonable assumptions and set confidence < 0.7. Only set clarificationNeeded = true when you genuinely cannot map ANY part of the question to available metrics AND the question is about something not in the database at all (e.g., weather data). A partial answer is better than no answer.
4. Date ranges: resolve relative terms ("last month", "this week", "YTD") using currentDate. If no date range is specified for metrics mode, default to the last 7 days. **Exception:** Inventory and customer metrics are NOT time-series — do NOT add date ranges for them.
5. Always include a date dimension when a date range is specified (metrics mode).
6. Filters must reference dimension slugs that are included in dimensions[] (metrics mode).
7. Return null for plan only when clarificationNeeded = true.
8. For general business questions that don't map directly to metrics (e.g., "how should I schedule staff?", "any ideas to boost revenue?"), use mode="metrics" with the most relevant available metrics and set confidence < 0.6. The downstream narrative layer will augment your data with business advice.

## Context
- Current date: ${context.currentDate}
- Tenant: ${context.tenantId}
- User role: ${context.userRole}
${context.locationId ? `- Location: ${context.locationId}` : '- Scope: all locations'}
${context.timezone ? `- Timezone: ${context.timezone}` : ''}

${lensSection}${catalogSection}

${compatSection}
${schemaSection}
${examplesSection}`.trim();
}

// ── JSON parser ───────────────────────────────────────────────────
// Tolerant parser: strips outer markdown fences if present.

interface RawIntentResponse {
  mode: PipelineMode;
  plan: Record<string, unknown> | null;
  confidence: number;
  clarificationNeeded: boolean;
  clarificationMessage?: string | null;
}

function parseIntentResponse(raw: string): RawIntentResponse {
  let cleaned = raw.trim();

  // Strip optional markdown fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }

  // If response contains prose around JSON, try to extract the JSON object
  if (!cleaned.startsWith('{')) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMError(
      `Intent resolver returned non-JSON: ${cleaned.slice(0, 200)}`,
      'PARSE_ERROR',
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new LLMError('Intent resolver response is not an object', 'PARSE_ERROR');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.confidence !== 'number') {
    throw new LLMError('Intent resolver missing confidence field', 'PARSE_ERROR');
  }
  if (typeof obj.clarificationNeeded !== 'boolean') {
    throw new LLMError('Intent resolver missing clarificationNeeded field', 'PARSE_ERROR');
  }

  // Parse mode — default to 'metrics' for backward compat with older prompts
  const mode: PipelineMode =
    typeof obj.mode === 'string' && (obj.mode === 'metrics' || obj.mode === 'sql')
      ? obj.mode
      : 'metrics';

  return {
    mode,
    plan: (obj.plan as Record<string, unknown> | null) ?? null,
    confidence: Math.min(1, Math.max(0, obj.confidence as number)),
    clarificationNeeded: obj.clarificationNeeded as boolean,
    clarificationMessage:
      typeof obj.clarificationMessage === 'string' ? obj.clarificationMessage : null,
  };
}

// ── Plan extractor ────────────────────────────────────────────────
// Coerces the raw plan record into a typed QueryPlan.

function extractQueryPlan(raw: Record<string, unknown> | null): QueryPlan | null {
  if (!raw) return null;

  return {
    metrics: Array.isArray(raw.metrics) ? (raw.metrics as string[]) : [],
    dimensions: Array.isArray(raw.dimensions) ? (raw.dimensions as string[]) : [],
    filters: Array.isArray(raw.filters) ? (raw.filters as QueryPlan['filters']) : [],
    dateRange:
      raw.dateRange &&
      typeof (raw.dateRange as Record<string, unknown>).start === 'string' &&
      typeof (raw.dateRange as Record<string, unknown>).end === 'string'
        ? {
            start: (raw.dateRange as Record<string, unknown>).start as string,
            end: (raw.dateRange as Record<string, unknown>).end as string,
          }
        : undefined,
    timeGranularity:
      typeof raw.timeGranularity === 'string'
        ? (raw.timeGranularity as QueryPlan['timeGranularity'])
        : undefined,
    sort: Array.isArray(raw.sort) ? (raw.sort as QueryPlan['sort']) : undefined,
    limit: typeof raw.limit === 'number' ? raw.limit : undefined,
    lensSlug: typeof raw.lensSlug === 'string' ? raw.lensSlug : undefined,
    intent: typeof raw.intent === 'string' ? raw.intent : undefined,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : undefined,
  };
}

// ── Public API ────────────────────────────────────────────────────

export interface ResolveIntentOptions {
  catalog: RegistryCatalog;
  examples?: EvalExample[];
  lensPromptFragment?: string | null;
  adapter?: LLMAdapter;
  /** Schema summary for mode routing (table names + descriptions) */
  schemaSummary?: string | null;
}

export async function resolveIntent(
  userMessage: string,
  context: IntentContext,
  opts: ResolveIntentOptions,
): Promise<ResolvedIntent> {
  const { catalog, examples = [], lensPromptFragment, adapter, schemaSummary } = opts;
  const llm = adapter ?? getLLMAdapter();

  // ── RAG: retrieve similar past queries for few-shot injection ──
  let ragExamplesSnippet = '';
  try {
    ragExamplesSnippet = await retrieveFewShotExamples(
      userMessage,
      context.tenantId,
      { maxExamples: 3, includeMetricsMode: true, includeSqlMode: true },
    );
  } catch (err) {
    // RAG retrieval is best-effort — never block intent resolution
    console.warn('[semantic] RAG retrieval failed (non-blocking):', err);
  }

  let systemPrompt = buildSystemPrompt(catalog, context, examples, lensPromptFragment, schemaSummary);

  // Append RAG examples after golden examples (if any were found)
  if (ragExamplesSnippet) {
    systemPrompt += '\n\n' + ragExamplesSnippet;
  }

  // Compose conversation: only user messages from history (assistant messages
  // contain narrative prose which causes the LLM to respond conversationally
  // instead of with JSON). Uses token-aware pruning instead of hard-coded slice.
  const historyUserMessages = pruneForIntentResolver(
    (context.history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  );

  const messages: LLMMessage[] = [
    ...historyUserMessages,
    { role: 'user', content: userMessage + '\n\nRespond ONLY with the JSON object. No prose.' },
  ];

  const startMs = Date.now();
  const response = await llm.complete(messages, {
    systemPrompt,
    temperature: 0,
    maxTokens: 1024,
  });
  const latencyMs = Date.now() - startMs;

  const parsed = parseIntentResponse(response.content);
  const plan = extractQueryPlan(parsed.plan);

  // If LLM says clarification needed but still returned a plan, trust the flag
  const isClarification = parsed.clarificationNeeded || plan === null;

  return {
    mode: parsed.mode,
    plan: plan ?? {
      metrics: [],
      dimensions: [],
      filters: [],
    },
    confidence: parsed.confidence,
    isClarification,
    clarificationText: parsed.clarificationMessage ?? undefined,
    rawResponse: response.content,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs,
    provider: response.provider,
    model: response.model,
  };
}
