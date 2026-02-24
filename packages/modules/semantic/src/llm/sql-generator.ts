import type { LLMAdapter, LLMMessage, IntentContext } from './types';
import { LLMError } from './types';
import { getLLMAdapter } from './adapters/anthropic';
import type { SchemaCatalog } from '../schema/schema-catalog';

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
3. **Always include \`LIMIT\`** — max 500 rows. Default to LIMIT 100 for lists, LIMIT 1 for lookups.
4. **Use only tables from the schema below.** Never reference tables not listed.
5. **Column names are snake_case** in the database.
6. **No semicolons** at the end of the query.
7. **No SQL comments** (no -- or /* */).

## Money Conventions (CRITICAL)
- **orders, order_lines, tenders**: amounts are in **cents** (INTEGER). To display as dollars: \`amount / 100.0\`
- **catalog_items** (price, cost): amounts are in **dollars** (NUMERIC). No conversion needed.
- **gl_journal_lines, ap_bills, ar_invoices**: amounts are in **dollars** (NUMERIC). No conversion needed.
- **rm_daily_sales, rm_item_sales**: amounts are in **dollars** (NUMERIC). No conversion needed.
- **inventory receiving** (receiving_receipt_lines): amounts are in **dollars** (NUMERIC 12,4).
- When the user asks about "sales" or "revenue" in dollar terms, convert cents to dollars.

## Date Conventions
- Most tables use \`created_at\` (timestamptz) for creation time.
- Orders have \`business_date\` (text, YYYY-MM-DD format) for the business day.
- Use \`business_date\` for date filtering on orders, not \`created_at\`.
- Current date: ${context.currentDate}
- "Today" = '${context.currentDate}', "yesterday" = date before that, "this week" = last 7 days, "this month" = current calendar month, "last month" = previous calendar month.

## Status Conventions
- Orders: 'open', 'placed', 'paid', 'voided'. Active orders = status IN ('placed', 'paid').
- Tenders: 'captured', 'reversed'. Active tenders = status = 'captured'.
- Catalog items: active items have \`archived_at IS NULL\`.
- Vendors: \`is_active = true\` for active vendors.
- Inventory: on-hand = SUM(quantity_delta) from inventory_movements. Never a stored column.

## Common Patterns
- Count of items: \`SELECT count(*) FROM table WHERE tenant_id = $1\`
- List with details: \`SELECT col1, col2 FROM table WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100\`
- Aggregation: \`SELECT date_col, SUM(amount) FROM table WHERE tenant_id = $1 GROUP BY date_col ORDER BY date_col\`
- Join: \`SELECT a.col, b.col FROM table_a a JOIN table_b b ON a.id = b.ref_id WHERE a.tenant_id = $1\`
- On-hand inventory: \`SELECT im.inventory_item_id, SUM(im.quantity_delta) as on_hand FROM inventory_movements im WHERE im.tenant_id = $1 GROUP BY im.inventory_item_id\`

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
}

export async function generateSql(
  userMessage: string,
  context: IntentContext,
  opts: GenerateSqlOptions,
): Promise<SqlGeneratorResult> {
  const { schemaCatalog, adapter } = opts;
  const llm = adapter ?? getLLMAdapter();

  const systemPrompt = buildSqlGeneratorPrompt(schemaCatalog, context);

  // Include recent user messages for multi-turn context
  const historyUserMessages = (context.history ?? [])
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => ({ role: 'user' as const, content: m.content }));

  const messages: LLMMessage[] = [
    ...historyUserMessages,
    { role: 'user', content: userMessage + '\n\nRespond ONLY with the JSON object. No prose.' },
  ];

  const startMs = Date.now();
  const response = await llm.complete(messages, {
    systemPrompt,
    temperature: 0,
    maxTokens: 2048,
  });
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
