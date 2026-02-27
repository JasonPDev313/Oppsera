import type { LLMAdapter, LLMMessage, IntentContext, LLMCompletionOptions } from './types';
import { LLMError } from './types';
import { getLLMAdapter, SEMANTIC_FAST_MODEL } from './adapters/anthropic';
import type { SchemaCatalog } from '../schema/schema-catalog';
import { pruneForSqlGenerator } from './conversation-pruner';
import { retrieveFewShotExamples } from '../rag/few-shot-retriever';

// ── SQL Generator (Mode B) ───────────────────────────────────────
// Generates SELECT SQL from a user's natural-language question
// using the full database schema as context.

export interface SqlGeneratorResult {
  sql: string;
  explanation: string;
  confidence: number;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  provider: string;
  model: string;
}

// ── System prompt builder ────────────────────────────────────────

function buildSqlGeneratorPrompt(
  schemaCatalog: SchemaCatalog,
  context: IntentContext,
): string {
  return `You are an expert PostgreSQL query generator for OppsEra, a multi-tenant SaaS ERP platform.

Your job: translate a user's natural-language question into a single SELECT query that answers it.

## Output Contract
Respond with a single JSON object — no markdown fences, no prose before/after:
\`\`\`
{
  "sql": "SELECT ... FROM ... WHERE tenant_id = $1 ...",
  "explanation": "Brief description of what this query returns",
  "confidence": 0.0-1.0
}
\`\`\`

## CRITICAL RULES
1. **SELECT only.** Never generate INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, or any DDL/DML.
2. **Always include \`WHERE tenant_id = $1\`** in the main query and all subqueries/CTEs. The parameter $1 is the tenant ID — it is the ONLY parameter you may use.
3. **Always include \`LIMIT\`** — max 500 rows. Default to LIMIT 100 for lists. **Exception:** Do NOT add LIMIT on COUNT/SUM/aggregate queries that return a single summary row — aggregates naturally return one row.
4. **Use only tables from the schema below.** Never reference tables not listed.
5. **Column names are snake_case** in the database.
6. **No semicolons** at the end of the query.
7. **No SQL comments** (no -- or /* */).

## KEY TABLE DISTINCTIONS (READ CAREFULLY)
- **\`users\`** = Staff/employee accounts (people who WORK at the business — managers, cashiers, servers). Has columns: name, email, status, primary_role_id, pos_pin. Use this table when the user asks about "users", "staff", "employees", "team members", or "workers".
- **\`customers\`** = Customer/member CRM records (people who BUY from or are members of the business). Has columns: first_name, last_name, email, phone, customer_type, display_name. Use this table when the user asks about "customers", "clients", "members", or "patrons".
- These are COMPLETELY DIFFERENT tables. "How many users?" → query \`users\`. "How many customers?" → query \`customers\`. NEVER confuse them.

## Money Conventions (CRITICAL)
- **orders, order_lines, tenders**: amounts are in **cents** (INTEGER). To display as dollars: \`amount / 100.0\`
- **catalog_items** (price, cost): amounts are in **dollars** (NUMERIC). No conversion needed.
- **gl_journal_lines, ap_bills, ar_invoices**: amounts are in **dollars** (NUMERIC). No conversion needed.
- **rm_daily_sales, rm_item_sales**: amounts are in **dollars** (NUMERIC). No conversion needed.
- **inventory receiving** (receiving_receipt_lines): amounts are in **dollars** (NUMERIC 12,4).
- **pms_reservations**: nightly_rate_cents, subtotal_cents, tax_cents, fee_cents, total_cents are in **cents** (INTEGER). Divide by 100.0 for dollars.
- **rm_pms_daily_occupancy**: adr_cents, revpar_cents are in **cents**. Divide by 100.0.
- **rm_pms_revenue_by_room_type**: room_revenue_cents, tax_revenue_cents, adr_cents are in **cents**. Divide by 100.0.
- When the user asks about "sales" or "revenue" in dollar terms, convert cents to dollars.

## Date Conventions
- Most tables use \`created_at\` (timestamptz) for creation time.
- Orders have \`business_date\` (text, YYYY-MM-DD format) for the business day.
- Use \`business_date\` for date filtering on orders, not \`created_at\`.
- **pms_reservations** have \`check_in_date\` (DATE) and \`check_out_date\` (DATE). Use check_in_date for "arriving on" queries, check_out_date for "departing on" queries. For "staying on" or "in-house on" a date, use: \`check_in_date <= date AND check_out_date > date\`.
- **rm_pms_daily_occupancy** uses \`business_date\` (DATE) — one row per property per day.
- Current date: ${context.currentDate}
- "Today" = '${context.currentDate}', "yesterday" = date before that, "this week" = last 7 days, "this month" = current calendar month, "last month" = previous calendar month.
- For "next Tuesday", "next Friday", etc., compute the specific date from the current date.

## Status Conventions
- Orders: 'open', 'placed', 'paid', 'voided'. Active orders = status IN ('placed', 'paid').
- Tenders: 'captured', 'reversed'. Active tenders = status = 'captured'.
- Catalog items: active items have \`archived_at IS NULL\`.
- Vendors: \`is_active = true\` for active vendors.
- Inventory: on-hand = SUM(quantity_delta) from inventory_movements. Never a stored column.
- **Reservations**: 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'HOLD'. Active/upcoming reservations = status IN ('CONFIRMED', 'HOLD'). In-house guests = status = 'CHECKED_IN'. Past stays = status = 'CHECKED_OUT'.
- **Rooms**: 'clean', 'occupied', 'dirty', 'cleaning', 'inspected'. Available rooms = status = 'clean' AND is_out_of_order = false.

## Common Patterns
- **Count of records**: \`SELECT count(*) as total FROM table WHERE tenant_id = $1\` — NO LIMIT on count queries!
- **Count with label**: \`SELECT count(*) as total_customers FROM customers WHERE tenant_id = $1\` — NO LIMIT needed.
- **List with details**: \`SELECT col1, col2 FROM table WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100\`
- **Aggregation**: \`SELECT date_col, SUM(amount) FROM table WHERE tenant_id = $1 GROUP BY date_col ORDER BY date_col LIMIT 500\`
- **Join**: \`SELECT a.col, b.col FROM table_a a JOIN table_b b ON a.id = b.ref_id AND b.tenant_id = $1 WHERE a.tenant_id = $1 LIMIT 100\`
- **On-hand inventory**: \`SELECT ii.id, ci.name, ci.sku, SUM(im.quantity_delta) as on_hand, ii.reorder_point, ii.par_level, ii.costing_method FROM inventory_movements im JOIN inventory_items ii ON im.inventory_item_id = ii.id AND ii.tenant_id = $1 JOIN catalog_items ci ON ii.catalog_item_id = ci.id AND ci.tenant_id = $1 WHERE im.tenant_id = $1 GROUP BY ii.id, ci.name, ci.sku, ii.reorder_point, ii.par_level, ii.costing_method ORDER BY ci.name LIMIT 100\`
- **Low stock items** (on-hand at or below reorder point): \`SELECT ci.name, ci.sku, SUM(im.quantity_delta) as on_hand, ii.reorder_point, ii.par_level FROM inventory_movements im JOIN inventory_items ii ON im.inventory_item_id = ii.id AND ii.tenant_id = $1 JOIN catalog_items ci ON ii.catalog_item_id = ci.id AND ci.tenant_id = $1 WHERE im.tenant_id = $1 GROUP BY ii.id, ci.name, ci.sku, ii.reorder_point, ii.par_level HAVING ii.reorder_point IS NOT NULL AND ii.reorder_point > 0 AND SUM(im.quantity_delta) <= ii.reorder_point ORDER BY SUM(im.quantity_delta) - ii.reorder_point ASC LIMIT 100\`
- **Catalog items list** (all products — use when inventory_items has no data): \`SELECT id, name, sku, item_type, price, cost FROM catalog_items WHERE tenant_id = $1 AND archived_at IS NULL ORDER BY name LIMIT 100\`
- **Inventory items with catalog info**: \`SELECT ci.name, ci.sku, ci.item_type, ci.price, ii.reorder_point, ii.par_level, ii.allow_negative, ii.costing_method FROM inventory_items ii JOIN catalog_items ci ON ii.catalog_item_id = ci.id AND ci.tenant_id = $1 WHERE ii.tenant_id = $1 ORDER BY ci.name LIMIT 100\`
- **Users (staff)**: \`SELECT id, name, email, status FROM users WHERE tenant_id = $1 LIMIT 100\`
- **Customers**: \`SELECT id, first_name, last_name, email, customer_type, display_name FROM customers WHERE tenant_id = $1 LIMIT 100\`
- **Reservations arriving on a date**: \`SELECT r.id, r.primary_guest_json->>'firstName' as first_name, r.primary_guest_json->>'lastName' as last_name, rt.name as room_type, rm.room_number, r.nightly_rate_cents / 100.0 as nightly_rate, r.nights, r.status FROM pms_reservations r JOIN pms_room_types rt ON r.room_type_id = rt.id AND rt.tenant_id = $1 LEFT JOIN pms_rooms rm ON r.room_id = rm.id AND rm.tenant_id = $1 WHERE r.tenant_id = $1 AND r.check_in_date = '2026-03-03' AND r.status IN ('CONFIRMED', 'HOLD') ORDER BY r.created_at LIMIT 100\`
- **In-house guests today**: \`SELECT r.id, r.primary_guest_json->>'firstName' as first_name, r.primary_guest_json->>'lastName' as last_name, rm.room_number, r.check_in_date, r.check_out_date FROM pms_reservations r LEFT JOIN pms_rooms rm ON r.room_id = rm.id AND rm.tenant_id = $1 WHERE r.tenant_id = $1 AND r.status = 'CHECKED_IN' ORDER BY rm.room_number LIMIT 100\`
- **Occupancy for a date range**: \`SELECT business_date, rooms_occupied, rooms_available, occupancy_pct, adr_cents / 100.0 as adr, revpar_cents / 100.0 as revpar FROM rm_pms_daily_occupancy WHERE tenant_id = $1 AND business_date BETWEEN '2026-02-25' AND '2026-03-03' ORDER BY business_date LIMIT 100\`
- **Reservation count for a date**: \`SELECT count(*) as reservation_count FROM pms_reservations WHERE tenant_id = $1 AND check_in_date = '2026-03-03' AND status IN ('CONFIRMED', 'HOLD', 'CHECKED_IN')\`

## Week-over-Week and Period Comparisons
When the user asks to compare periods (e.g., "last week vs week before", "this month vs last month"):
- Use a CTE or subqueries to compute each period separately, then combine:
\`\`\`
WITH last_week AS (
  SELECT count(*) as order_count, SUM(subtotal_cents) / 100.0 as revenue
  FROM orders WHERE tenant_id = $1 AND status IN ('placed','paid')
  AND business_date >= '2026-02-16' AND business_date <= '2026-02-22'
), prev_week AS (
  SELECT count(*) as order_count, SUM(subtotal_cents) / 100.0 as revenue
  FROM orders WHERE tenant_id = $1 AND status IN ('placed','paid')
  AND business_date >= '2026-02-09' AND business_date <= '2026-02-15'
)
SELECT 'Last Week' as period, order_count, revenue FROM last_week
UNION ALL
SELECT 'Previous Week' as period, order_count, revenue FROM prev_week
\`\`\`
- Always label each period row clearly ('Last Week', 'Previous Week', 'This Month', etc.)
- Include both absolute values and compute percent change if relevant
- Use business_date for orders (not created_at)
- Remember: order amounts are in CENTS — divide by 100.0 for dollar values

## Important Query Guidelines
- When the user says "how many" or asks for a count, use \`SELECT count(*) ...\` with NO LIMIT clause. Aggregates return a single row naturally.
- When listing records, include the most useful columns (name, email, status, dates) not just IDs.
- Always alias computed columns: \`count(*) as total\`, \`SUM(amount) / 100.0 as total_dollars\`.
- For orders/tenders monetary values, always convert cents to dollars: \`subtotal_cents / 100.0 as subtotal\`.
- Prefer human-readable output: include names, not just IDs. Join to get display names when possible.
- **Inventory queries**: Always JOIN inventory_items with catalog_items to get human-readable names. On-hand quantity = \`SUM(quantity_delta)\` from \`inventory_movements\` (never a stored column). For "low stock" or "need to reorder", compare on-hand to \`reorder_point\`. If the user asks about inventory and there might be no inventory_movements data yet, fall back to querying \`catalog_items\` directly to show what items exist in the catalog.

## Context
- Current date: ${context.currentDate}
- Tenant: ${context.tenantId}
- User role: ${context.userRole}
${context.locationId ? `- Location: ${context.locationId}` : '- Scope: all locations'}
${context.timezone ? `- Timezone: ${context.timezone}` : ''}

## Database Schema
${schemaCatalog.fullText}`.trim();
}

// ── JSON parser ──────────────────────────────────────────────────

interface RawSqlResponse {
  sql: string;
  explanation: string;
  confidence: number;
}

function parseSqlResponse(raw: string): RawSqlResponse {
  let cleaned = raw.trim();

  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }

  // Extract JSON from surrounding prose
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
      `SQL generator returned non-JSON: ${cleaned.slice(0, 200)}`,
      'PARSE_ERROR',
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new LLMError('SQL generator response is not an object', 'PARSE_ERROR');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.sql !== 'string' || !obj.sql.trim()) {
    throw new LLMError('SQL generator response missing sql field', 'PARSE_ERROR');
  }

  return {
    sql: obj.sql.trim(),
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
    confidence: typeof obj.confidence === 'number'
      ? Math.min(1, Math.max(0, obj.confidence))
      : 0.5,
  };
}

// ── Public API ────────────────────────────────────────────────────

export interface GenerateSqlOptions {
  schemaCatalog: SchemaCatalog;
  adapter?: LLMAdapter;
  /** Pre-fetched RAG snippet from intent resolution — avoids duplicate DB query */
  ragExamplesSnippet?: string;
}

export async function generateSql(
  userMessage: string,
  context: IntentContext,
  opts: GenerateSqlOptions,
): Promise<SqlGeneratorResult> {
  const { schemaCatalog, adapter, ragExamplesSnippet: precomputedRag } = opts;
  const llm = adapter ?? getLLMAdapter();

  // ── RAG: use pre-fetched snippet from intent resolution, or fetch if not provided ──
  let ragExamplesSnippet = precomputedRag ?? '';
  if (!ragExamplesSnippet) {
    try {
      ragExamplesSnippet = await retrieveFewShotExamples(
        userMessage,
        context.tenantId,
        { maxExamples: 3, includeSqlMode: true, includeMetricsMode: false },
      );
    } catch {
      // RAG retrieval is best-effort — never block SQL generation
    }
  }

  const systemPrompt = buildSqlGeneratorPrompt(schemaCatalog, context);

  // Include recent user messages for multi-turn context (token-aware pruning)
  const historyUserMessages = pruneForSqlGenerator(
    (context.history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  );

  const messages: LLMMessage[] = [
    ...historyUserMessages,
    { role: 'user', content: userMessage + '\n\nRespond ONLY with the JSON object. No prose.' },
  ];

  // ── SEM-02: Split system prompt into static (cacheable) and dynamic parts ──
  // The DB schema, money conventions, and common patterns are highly stable.
  // Context (date, tenant, role) and RAG examples change per request.
  const contextStart = systemPrompt.indexOf('\n## Context\n');
  let completionOpts: LLMCompletionOptions;
  if (contextStart > 0) {
    const staticPart = systemPrompt.slice(0, contextStart).trimEnd();
    let dynamicPart = systemPrompt.slice(contextStart);
    if (ragExamplesSnippet) {
      dynamicPart += '\n\n' + ragExamplesSnippet;
    }
    completionOpts = {
      systemPromptParts: [
        { text: staticPart, cacheControl: true },
        { text: dynamicPart },
      ],
      temperature: 0,
      maxTokens: 2048,
      model: SEMANTIC_FAST_MODEL,
    };
  } else {
    let finalPrompt = systemPrompt;
    if (ragExamplesSnippet) {
      finalPrompt += '\n\n' + ragExamplesSnippet;
    }
    completionOpts = {
      systemPrompt: finalPrompt,
      temperature: 0,
      maxTokens: 2048,
      model: SEMANTIC_FAST_MODEL,
    };
  }

  const startMs = Date.now();
  const response = await llm.complete(messages, completionOpts);
  const latencyMs = Date.now() - startMs;

  const parsed = parseSqlResponse(response.content);

  return {
    sql: parsed.sql,
    explanation: parsed.explanation,
    confidence: parsed.confidence,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs,
    provider: response.provider,
    model: response.model,
  };
}
