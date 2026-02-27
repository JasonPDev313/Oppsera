import type { LLMAdapter, LLMMessage, IntentContext, ResolvedIntent, PipelineMode, LLMCompletionOptions } from './types';
import { LLMError } from './types';
import type { QueryPlan } from '../compiler/types';
import type { RegistryCatalog, MetricDef, DimensionDef } from '../registry/types';
import type { EvalExample } from '../evaluation/types';
import { getLLMAdapter, SEMANTIC_FAST_MODEL } from './adapters/anthropic';
import { pruneForIntentResolver } from './conversation-pruner';
import { retrieveFewShotExamples } from '../rag/few-shot-retriever';
import { guardPromptSize } from './adapters/resilience';
import { z } from 'zod';

// ── SEM-01: Zod schemas for structured LLM output validation ──────
// These schemas enforce the output contract documented in the system prompt,
// providing clear parse errors and automatic type coercion (defaults, clamping).

const PlanFilterSchema = z.object({
  dimensionSlug: z.string(),
  operator: z.string(),    // lenient — compiler validates supported operators
  value: z.unknown().optional(),
  values: z.array(z.unknown()).optional(),
  rangeStart: z.unknown().optional(),
  rangeEnd: z.unknown().optional(),
});

const PlanSortSchema = z.object({
  metricSlug: z.string().optional(),
  dimensionSlug: z.string().optional(),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

const DateRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const QueryPlanSchema = z.object({
  metrics: z.array(z.string()).default([]),
  dimensions: z.array(z.string()).default([]),
  filters: z.array(PlanFilterSchema).default([]),
  dateRange: DateRangeSchema.nullish(),
  timeGranularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).nullish(),
  sort: z.array(PlanSortSchema).nullish(),
  limit: z.number().nullish(),
  lensSlug: z.string().nullish(),
  intent: z.string().optional(),
  rationale: z.string().optional(),
});

const IntentResponseSchema = z.object({
  mode: z.enum(['metrics', 'sql']).default('metrics'),
  plan: z.record(z.unknown()).nullable().default(null),
  confidence: z.coerce.number().transform((v) => Math.min(1, Math.max(0, v))),
  clarificationNeeded: z.boolean(),
  clarificationMessage: z.string().nullable().optional().default(null),
  clarificationOptions: z.array(z.string()).max(5).nullable().optional().default(null),
});

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
    rm_pms_daily_occupancy: 'PMS Occupancy (rooms occupied, arrivals, departures, ADR, RevPAR)',
    rm_pms_revenue_by_room_type: 'PMS Room Revenue by Type',
    rm_pms_housekeeping_productivity: 'PMS Housekeeping Productivity',
    pms_reservations: 'PMS Reservations (booking counts, cancellations, no-shows, avg rate, avg stay length)',
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
  "clarificationMessage": string | null,  // the question to ask the user (if clarificationNeeded)
  "clarificationOptions": string[] | null // 3-5 clickable option buttons for the user to choose from (if clarificationNeeded). Each option should be a complete, ready-to-send question that directly resolves the ambiguity. Make options specific and actionable, not generic.
}
\`\`\`

## Mode Routing Rules
- Use **mode="metrics"** when the question is about sales analytics, revenue, order counts, item performance, or any topic that maps cleanly to the Available Metrics below. This mode is faster and more reliable for these queries.
- Use **mode="sql"** when the question is about specific records, data exploration, operational details, entity lookups, configuration, or anything NOT covered by the Available Metrics. Examples: "how many users do I have", "list my vendors", "which catalog items have no inventory", "show me orders from customer X", "what tables need setup".
- **Also use mode="sql"** when the question involves period comparisons ("compare to last week", "vs previous month", "week over week") — SQL mode handles CTEs for multi-period comparison better than metrics mode.
- **IMPORTANT: Use mode="sql" for inventory questions** — questions about inventory items, stock levels, low stock, reorder points, what items we have, item counts, catalog items, etc. The inventory read model (rm_inventory_on_hand) may be empty, but operational tables (inventory_items, inventory_movements, catalog_items) have the live data. SQL mode queries these directly and gives accurate results.
- When in doubt, prefer **mode="sql"** — it can answer any question about the database.
- For mode="sql", still fill in the plan with "intent" and "rationale" fields (metrics/dimensions can be empty arrays).

## Data Dictionary — Critical Rules

### Money Conventions
- Metrics from rm_daily_sales and rm_item_sales are already in DOLLARS (no conversion needed)
- Metrics from rm_customer_activity total_spend is in DOLLARS
- PMS metrics (adr, revpar, room_revenue, tax_revenue_pms) convert cents→dollars automatically in their SQL expressions
- If you route to SQL mode: orders/tenders tables store amounts in CENTS (divide by 100 for dollars)
- If you route to SQL mode: pms_reservations amounts (nightly_rate_cents, total_cents, etc.) are in CENTS
- If you route to SQL mode: rm_pms_daily_occupancy adr_cents, revpar_cents are in CENTS
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
- **Reservations**: Active/upcoming = status IN ('CONFIRMED', 'HOLD'). In-house = 'CHECKED_IN'. Completed = 'CHECKED_OUT'. Cancelled = 'CANCELLED'. No-show = 'NO_SHOW'.

### PMS (Property Management) Routing
- For **aggregate occupancy/rate questions** (occupancy %, ADR, RevPAR, rooms occupied, arrivals count, departures count) → use **mode="metrics"** with PMS metrics from rm_pms_daily_occupancy / rm_pms_revenue_by_room_type / rm_pms_housekeeping_productivity.
- For **specific reservation questions** (list reservations for a date, guest details, room assignments, upcoming arrivals with names, in-house guests) → use **mode="sql"** querying pms_reservations, pms_guests, pms_rooms, pms_room_types directly.
- For "how many reservations" on a specific date → use **mode="sql"** with COUNT on pms_reservations (the read models don't track individual reservation counts).
- pms_reservations has check_in_date (DATE) and check_out_date (DATE) for date-based queries. Use primary_guest_json->>'firstName' and primary_guest_json->>'lastName' for guest names.

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
  clarificationOptions?: string[] | null;
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

  // SEM-01: Validate with Zod schema — provides clear error messages,
  // automatic defaults (mode → 'metrics'), and confidence clamping (0–1).
  const result = IntentResponseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new LLMError(
      `Intent resolver output validation failed: ${issues}`,
      'PARSE_ERROR',
    );
  }

  return result.data;
}

// ── Plan extractor ────────────────────────────────────────────────
// Coerces the raw plan record into a typed QueryPlan.

function extractQueryPlan(raw: Record<string, unknown> | null): QueryPlan | null {
  if (!raw) return null;

  // SEM-01: Validate with Zod schema — graceful fallback on malformed plans.
  // This replaces manual field-by-field type checks with schema validation,
  // providing defaults for missing arrays and coercing types automatically.
  const result = QueryPlanSchema.safeParse(raw);
  if (!result.success) {
    console.warn('[semantic] Plan validation failed, falling back to empty plan:', result.error.issues);
    return {
      metrics: [],
      dimensions: [],
      filters: [],
    };
  }

  const p = result.data;
  return {
    metrics: p.metrics,
    dimensions: p.dimensions,
    filters: p.filters as QueryPlan['filters'],
    dateRange: p.dateRange ?? undefined,
    timeGranularity: p.timeGranularity ?? undefined,
    sort: p.sort ?? undefined,
    limit: p.limit ?? undefined,
    lensSlug: p.lensSlug ?? undefined,
    intent: p.intent,
    rationale: p.rationale,
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

  const rawSystemPrompt = buildSystemPrompt(catalog, context, examples, lensPromptFragment, schemaSummary);

  // ── Prompt size guard: truncate oversized sections to prevent context overflow ──
  // Schema catalog and examples can grow very large with many tables/golden examples.
  // Guard truncates progressively: RAG → examples → schema, preserving the base prompt.
  const guarded = guardPromptSize({
    basePrompt: rawSystemPrompt,
    schemaSection: schemaSummary ?? null,
    examplesSection: examples.length > 0 ? buildExamplesSnippet(examples) : null,
    ragSection: ragExamplesSnippet || null,
  });
  if (guarded.wasTruncated) {
    console.warn('[semantic] Prompt truncated to fit context window — some schema/examples may be reduced');
  }

  // Rebuild final prompt: base already includes schema + golden examples inline via buildSystemPrompt,
  // so we only append RAG examples separately (they are fetched after prompt construction).
  let systemPrompt = rawSystemPrompt;

  // Append RAG examples after golden examples (if any were found)
  // Use guarded version if it was truncated
  if (guarded.ragSection) {
    systemPrompt += '\n\n' + guarded.ragSection;
  } else if (ragExamplesSnippet && !guarded.wasTruncated) {
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

  // ── SEM-02: Split system prompt into static (cacheable) and dynamic parts ──
  // The data dictionary, output contract, mode routing rules, and metric
  // catalog rarely change. These are placed in a cache_control block so
  // Anthropic caches ~90% of input tokens across calls.
  const contextStart = systemPrompt.indexOf('## Context\n');
  let completionOpts: LLMCompletionOptions;
  if (contextStart > 0) {
    const staticPart = systemPrompt.slice(0, contextStart).trimEnd();
    const dynamicPart = systemPrompt.slice(contextStart);
    completionOpts = {
      systemPromptParts: [
        { text: staticPart, cacheControl: true },
        { text: dynamicPart },
      ],
      temperature: 0,
      maxTokens: 1024,
      model: SEMANTIC_FAST_MODEL,
    };
  } else {
    completionOpts = {
      systemPrompt,
      temperature: 0,
      maxTokens: 1024,
      model: SEMANTIC_FAST_MODEL,
    };
  }

  const startMs = Date.now();
  const response = await llm.complete(messages, completionOpts);
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
    clarificationOptions: parsed.clarificationOptions ?? undefined,
    rawResponse: response.content,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs,
    provider: response.provider,
    model: response.model,
    ragExamplesSnippet: ragExamplesSnippet || undefined,
  };
}
