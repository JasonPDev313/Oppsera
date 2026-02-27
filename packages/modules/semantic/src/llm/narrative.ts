import type { LLMAdapter, LLMMessage, IntentContext, NarrativeResponse, NarrativeSection, QueryResult, LLMCompletionOptions } from './types';
import type { ResolvedIntent } from './types';
import type { MetricDef, DimensionDef } from '../registry/types';
import { getLLMAdapter, SEMANTIC_FAST_MODEL } from './adapters/anthropic';
import { getNarrativeConfig } from '../config/narrative-config';
import { maskRowsForLLM } from '../pii/pii-masker';

// ── Industry translation ─────────────────────────────────────────

function getIndustryHint(lensSlug?: string | null): string {
  if (lensSlug?.startsWith('golf')) {
    return 'Industry: Golf. Translate capacity → tee sheet utilization, revenue → yield per round, throughput → rounds played, efficiency → pace of play.';
  }
  if (lensSlug?.startsWith('core_items')) {
    return 'Industry: Retail/F&B. Translate capacity → shelf space or menu exposure, throughput → items sold, efficiency → sell-through rate.';
  }
  if (lensSlug?.startsWith('core_sales')) {
    return 'Industry: Retail/Hospitality. Translate capacity → covers or transactions, throughput → order count, efficiency → average ticket.';
  }
  return 'Industry: General SMB. Use generic operational language unless you can infer the industry from the question.';
}

// ── Metric context builder ───────────────────────────────────────

function buildMetricContext(metricDefs: MetricDef[]): string {
  if (metricDefs.length === 0) return '';

  const lines = metricDefs.map((m) => {
    const direction = m.higherIsBetter === true
      ? 'Higher is better.'
      : m.higherIsBetter === false
        ? 'Lower is better.'
        : '';
    return `- **${m.displayName}** (\`${m.slug}\`): ${m.description ?? 'No description'}. ${direction} Format: ${m.formatPattern ?? m.dataType}`;
  });

  return `## Metrics in This Query\n${lines.join('\n')}`;
}

// ── Default prompt template ──────────────────────────────────────
// This is the hardcoded default. Admins can override it via the
// semantic_narrative_config table. The template uses {{PLACEHOLDER}}
// tokens that are replaced at runtime with dynamic content.
//
// Available placeholders:
//   {{INDUSTRY_HINT}}   — industry-specific translation guidance
//   {{LENS_SECTION}}    — active lens prompt fragment (if any)
//   {{METRIC_SECTION}}  — metric definitions for the current query

const DEFAULT_PROMPT_TEMPLATE = `You are operating under THE OPPS ERA LENS.

You are a practical, data-driven SMB operator and advisor helping businesses increase revenue, improve efficiency, and simplify operations.

You think in: revenue throughput, capacity utilization, labor efficiency, customer experience, ROI and payback.

You understand that every SMB operates with: limited staff, imperfect data, time pressure, cash constraints, and operational variability.

Tone: Friendly, optimistic, practical, slightly quirky — like a smart operator helping another owner win. Use first person plural ("we", "our").

{{INDUSTRY_HINT}}

## DATA-FIRST DECISION RULE

When answering:
1. If query results are provided → use that data first. Analyze numbers, spot trends, flag anomalies.
2. If partial data exists → combine available data with reasonable assumptions.
3. If no data exists → use industry best practices, market benchmarks, and operational heuristics.

Priority: REAL DATA → ASSUMPTIONS → BEST PRACTICE

If assumptions are required, always include an Assumptions section.
Never stall waiting for data. Proceed with the best available reasoning.
Never refuse a question. Every question gets a useful answer.

## RESPONSE FORMAT

Respond in **markdown only** — no JSON, no code fences. Choose the right depth:

### DEFAULT MODE (most responses)

Keep it concise and high-value:

## Answer
[1-3 sentence direct answer. Lead with the number or insight. Be specific.]

### Options
**Option 1: [Name]** — [What + why]. Effort: Low/Med/High. Impact: Low/Med/High.
**Option 2: [Name]** — [What + why]. Effort: Low/Med/High. Impact: Low/Med/High.
**Option 3: [Name]** — [What + why]. Effort: Low/Med/High. Impact: Low/Med/High.

### Recommendation
Best option: **[Name]** — [Why in 1-2 sentences]. Confidence: XX%.

### Quick Wins
- [Action 1 — highest leverage first]
- [Action 2]
- [Action 3]

### ROI Snapshot
- Estimated cost: $X
- Potential monthly impact: $X
- Rough payback: X weeks/months

### What to Track
- [Metric 1]
- [Metric 2]

### Next Steps
[1-2 follow-up topics + 1-2 smart questions to keep the conversation going. End with a friendly close like "Want to go deeper on pricing, staffing, or growth?"]

---
*THE OPPS ERA LENS. [Metrics used]. [Period]. [Assumptions if any.]*

### WHEN TO USE DEEP MODE

ONLY expand to full analysis when: user requests detailed analysis, strategic/financial investment decision, complex multi-variable problem, or user explicitly asks for a plan/roadmap.

If Deep Mode, label: **Deep Analysis — THE OPPS ERA LENS** and expand options to 3-5 with comparison, risks, and execution roadmap.

### WHEN TO USE QUICK WINS MODE

If user asks for fast improvements or urgent help, label: **Quick Wins — THE OPPS ERA LENS** and provide 5 immediate actions, minimal explanation, highest leverage first.

## Data Interpretation Rules
- All monetary values in query results are already in DOLLARS (not cents). Display as $X,XXX.XX.
- Metrics from rm_daily_sales are pre-aggregated per day per location. Each row = one day at one location.
- Metrics from rm_item_sales are per item per date per location. Multiple rows per day is normal.
- Inventory metrics are SNAPSHOTS — "current as of last sync", not a date range. Don't say "inventory for this week."
- Customer metrics are lifetime RUNNING TOTALS — not filtered by date. Don't say "customers this month."
- "0 rows returned" for a date range likely means no transactions occurred that period, not a data error. Say so helpfully.
- Order count and items sold are different: one order can contain many items. items_sold ≠ order_count.
- avg_order_value is net_sales / order_count — it is a ratio, not a summable metric.

## RULES
1. **Never refuse.** Every question gets a useful answer.
2. **Lead with the answer.** Don't start with "Based on the data..." — just state the finding.
3. **Be specific with numbers.** $X,XXX.XX for currency, X.X% for percentages, human-readable dates.
4. **Operator mindset.** Connect data to decisions: staffing, pricing, scheduling, inventory, marketing.
5. **Token efficient.** Under 400 words for DEFAULT. Don't generate unnecessary sections. Skip sections that don't apply.
6. **Don't parrot raw data.** Interpret it. "$12,400 net sales" → "We did $12,400 — solid for a Tuesday, about 8% above our weekday average."
7. **Options are optional.** For simple data questions (e.g., "what were sales yesterday?"), skip Options/Recommendation and just answer + quick wins + what to track.
8. **Industry translation.** Translate recommendations into the user's industry language automatically.

{{LENS_SECTION}}{{METRIC_SECTION}}`;

/**
 * Returns the hardcoded default prompt template (for admin UI display / reset).
 */
export function getDefaultPromptTemplate(): string {
  return DEFAULT_PROMPT_TEMPLATE;
}

// ── System prompt builder ────────────────────────────────────────

interface NarrativePromptContext {
  lensSlug?: string | null;
  lensPromptFragment?: string | null;
  metricDefs?: MetricDef[];
  dimensionDefs?: DimensionDef[];
}

interface NarrativePromptResult {
  /** Fully resolved system prompt (for legacy callers / tests) */
  full: string;
  /**
   * Structured parts for Anthropic prompt caching (SEM-02).
   * Part 1 = static template (cacheable). Part 2 = per-request dynamic content.
   * Only populated when the template contains the `{{INDUSTRY_HINT}}` marker
   * (i.e., the standard OPPS ERA LENS template structure).
   */
  parts: Array<{ text: string; cacheControl?: boolean }> | null;
}

async function buildNarrativeSystemPrompt(promptCtx: NarrativePromptContext): Promise<NarrativePromptResult> {
  const metricSection = buildMetricContext(promptCtx.metricDefs ?? []);
  const industryHint = getIndustryHint(promptCtx.lensSlug);
  const lensSection = promptCtx.lensPromptFragment
    ? `## Active Lens\n${promptCtx.lensPromptFragment}\n`
    : '';

  // Load custom template from DB (cached), fall back to hardcoded default
  const customTemplate = await getNarrativeConfig();
  const template = customTemplate ?? DEFAULT_PROMPT_TEMPLATE;

  const full = template
    .replace('{{INDUSTRY_HINT}}', industryHint)
    .replace('{{LENS_SECTION}}', lensSection)
    .replace('{{METRIC_SECTION}}', metricSection)
    .trim();

  // ── SEM-02: Build prompt caching parts ───────────────────────
  // The template is mostly static (OPPS ERA LENS framework, rules, format).
  // The dynamic parts are: industry hint, lens fragment, metric definitions.
  // Strategy: cache the template with placeholders replaced by empty strings
  // (it's ~2K tokens of stable prompt), then send dynamic content as a
  // separate uncached block.
  const industryIdx = template.indexOf('{{INDUSTRY_HINT}}');
  if (industryIdx > 0) {
    // Build the static part: template with all placeholders stripped
    const staticPart = template
      .replace('{{INDUSTRY_HINT}}', '')
      .replace('{{LENS_SECTION}}', '')
      .replace('{{METRIC_SECTION}}', '')
      .trim();

    // Build dynamic part from per-request content
    const dynamicLines: string[] = [];
    if (industryHint) dynamicLines.push(industryHint);
    if (lensSection) dynamicLines.push(lensSection);
    if (metricSection) dynamicLines.push(metricSection);

    const dynamicPart = dynamicLines.join('\n\n');

    return {
      full,
      parts: dynamicPart
        ? [
            { text: staticPart, cacheControl: true },
            { text: dynamicPart },
          ]
        : [{ text: staticPart, cacheControl: true }],
    };
  }

  // Custom template without standard placeholders — no caching split possible
  return { full, parts: null };
}

// ── Data summary builder ──────────────────────────────────────────

const MAX_ROWS_IN_PROMPT = 20;
const MAX_COLS_IN_PROMPT = 8;

function buildDataSummary(result: QueryResult | null, intentSummary: string, premaskedRows?: Record<string, unknown>[]): string {
  if (!result || result.rowCount === 0) {
    return `## Query Results\nNo data returned for: "${intentSummary}"\n\nNo query data available. Use industry best practices, benchmarks, and operational heuristics. Label assumptions clearly.`;
  }

  const { rows, rowCount, truncated } = result;
  let sampleRows: Record<string, unknown>[];
  if (premaskedRows && premaskedRows.length > 0) {
    // Use pre-masked rows from pipeline — avoids redundant PII masking pass
    sampleRows = premaskedRows.slice(0, MAX_ROWS_IN_PROMPT);
  } else {
    try {
      sampleRows = maskRowsForLLM(rows.slice(0, MAX_ROWS_IN_PROMPT));
    } catch {
      sampleRows = rows.slice(0, MAX_ROWS_IN_PROMPT);
    }
  }
  const columns = sampleRows.length > 0
    ? Object.keys(sampleRows[0]!).slice(0, MAX_COLS_IN_PROMPT)
    : [];

  const header = columns.join(' | ');
  const separator = columns.map(() => '---').join(' | ');
  const dataRows = sampleRows.map((row) =>
    columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return 'null';
      if (typeof val === 'number') return val.toLocaleString();
      return String(val);
    }).join(' | '),
  );

  const tableStr = [header, separator, ...dataRows].join('\n');

  const truncationNote = truncated
    ? `\n\n_Results truncated — showing ${MAX_ROWS_IN_PROMPT} of ${rowCount}+ rows._`
    : rowCount > MAX_ROWS_IN_PROMPT
    ? `\n\n_Showing ${MAX_ROWS_IN_PROMPT} of ${rowCount} rows._`
    : '';

  return `## Query Results\nQuestion: "${intentSummary}"\nTotal rows: ${rowCount}${truncated ? '+' : ''}\n\n${tableStr}${truncationNote}`;
}

// ── Markdown narrative parser ─────────────────────────────────────

const HEADING_TO_SECTION: Record<string, NarrativeSection['type']> = {
  // THE OPPS ERA LENS sections
  'answer': 'answer',
  'options': 'options',
  'recommendation': 'recommendation',
  'quick wins': 'quick_wins',
  'roi snapshot': 'roi_snapshot',
  'what to track': 'what_to_track',
  'metrics': 'what_to_track',
  'next steps': 'conversation_driver',
  'conversation driver': 'conversation_driver',
  'assumptions': 'assumptions',
  // Deep mode
  'deep analysis — the opps era lens': 'answer',
  'quick wins — the opps era lens': 'quick_wins',
  'executive summary — the opps era lens': 'answer',
  // General sections
  'key takeaways': 'takeaway',
  'takeaways': 'takeaway',
  "what i'd do next": 'action',
  'what i would do next': 'action',
  'recommendations': 'recommendation',
  'risks to watch': 'risk',
  'risks': 'risk',
  'caveats': 'caveat',
  // Proactive intelligence sections
  'follow-up questions': 'follow_up',
  'suggested questions': 'follow_up',
  'chart': 'chart_hint',
  'visualization': 'chart_hint',
};

interface RawNarrativeResponse {
  text: string;
  sections: NarrativeSection[];
}

function parseMarkdownNarrative(raw: string): RawNarrativeResponse {
  const sections: NarrativeSection[] = [];
  const text = raw.trim();

  // Split on ## or ### headings
  const parts = text.split(/^(#{2,3})\s+(.+)$/m);

  // parts alternates: [prelude, hashes, heading, content, hashes, heading, content, ...]

  // Handle any content before the first heading
  if (parts[0] && parts[0].trim()) {
    const prelude = parts[0].trim();
    if (!prelude.startsWith('*') && !prelude.startsWith('---')) {
      sections.push({ type: 'answer', content: prelude });
    }
  }
  let i = 1;

  while (i < parts.length - 2) {
    const headingText = (parts[i + 1] ?? '').trim().toLowerCase();
    const content = (parts[i + 2] ?? '').trim();
    i += 3;

    if (!content) continue;

    // Clean content: remove trailing --- and *THE OPPS ERA LENS* / *Data:* footer
    let cleanContent = content;
    const footerIdx = cleanContent.lastIndexOf('\n---');
    let footerText: string | null = null;
    if (footerIdx !== -1) {
      footerText = cleanContent.slice(footerIdx).trim();
      cleanContent = cleanContent.slice(0, footerIdx).trim();
    }

    const sectionType = HEADING_TO_SECTION[headingText] ?? 'detail';
    if (cleanContent) {
      sections.push({ type: sectionType, content: cleanContent });
    }

    // Extract data footer if present
    if (footerText) {
      const dataMatch = footerText.match(/\*(?:THE OPPS ERA LENS\.?\s*)?(.+)\*/);
      if (dataMatch) {
        sections.push({ type: 'data_sources', content: dataMatch[1]!.trim() });
      }
    }
  }

  // Check for footer at the very end of the text (outside any heading)
  if (sections.every((s) => s.type !== 'data_sources')) {
    const dataFooterMatch = text.match(/---\s*\n\s*\*(?:THE OPPS ERA LENS\.?\s*)?(.+)\*/);
    if (dataFooterMatch) {
      sections.push({ type: 'data_sources', content: dataFooterMatch[1]!.trim() });
    }
  }

  // If no sections were parsed, treat the whole text as an answer
  if (sections.length === 0) {
    sections.push({ type: 'answer', content: text });
  }

  return { text, sections };
}

function parseNarrativeResponse(raw: string): RawNarrativeResponse {
  let cleaned = raw.trim();

  // Strip markdown code fences if the LLM wrapped the response
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  }

  // Try JSON first (backward compat with old prompt format)
  if (cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        const text = typeof obj.text === 'string' ? obj.text : cleaned;
        const sections = Array.isArray(obj.sections)
          ? (obj.sections as NarrativeSection[]).filter(
              (s) => typeof s.type === 'string' && typeof s.content === 'string',
            )
          : [{ type: 'answer' as const, content: text }];
        return { text, sections };
      }
    } catch {
      // Not valid JSON — fall through to markdown parsing
    }
  }

  // Markdown mode: parse headings into sections
  return parseMarkdownNarrative(cleaned);
}

// ── Public API ────────────────────────────────────────────────────

export interface GenerateNarrativeOptions {
  adapter?: LLMAdapter;
  lensSlug?: string | null;
  lensPromptFragment?: string | null;
  metricDefs?: MetricDef[];
  dimensionDefs?: DimensionDef[];
  /** When true, use the fast model (Haiku) with reduced tokens for time-constrained responses */
  fast?: boolean;
  /** Max time (ms) the LLM call should take. Passed to the adapter as per-call timeout. */
  timeoutMs?: number;
  /** Pre-masked rows from the pipeline — avoids double PII masking when provided */
  premaskedRows?: Record<string, unknown>[];
  /** SEM-09: Plausibility warnings to inject as data quality caveats */
  plausibilityContext?: string | null;
}

export async function generateNarrative(
  result: QueryResult | null,
  intent: ResolvedIntent,
  originalMessage: string,
  context: IntentContext,
  opts: GenerateNarrativeOptions = {},
): Promise<NarrativeResponse> {
  const llm = opts.adapter ?? getLLMAdapter();

  const narrativePrompt = await buildNarrativeSystemPrompt({
    lensSlug: opts.lensSlug,
    lensPromptFragment: opts.lensPromptFragment,
    metricDefs: opts.metricDefs,
    dimensionDefs: opts.dimensionDefs,
  });

  const intentSummary = intent.plan.intent ?? originalMessage;
  const dataSummary = buildDataSummary(result, intentSummary, opts.premaskedRows);

  const contentParts = [
    `## Original Question\n${originalMessage}`,
    `## Context\n- Date: ${context.currentDate}\n- Role: ${context.userRole}${context.locationId ? `\n- Location: ${context.locationId}` : ''}${context.timezone ? `\n- Timezone: ${context.timezone}` : ''}`,
    dataSummary,
  ];

  // SEM-09: Inject plausibility warnings so the narrative can add caveats
  if (opts.plausibilityContext) {
    contentParts.push(opts.plausibilityContext);
  }

  const userContent = contentParts.join('\n\n');

  const messages: LLMMessage[] = [
    { role: 'user', content: userContent },
  ];

  // Default to fast model (Haiku) for lower latency. Use Sonnet only when explicitly
  // requested via fast === false (e.g., deep/strategic analysis).
  const useSonnet = opts.fast === false;
  const startMs = Date.now();

  // SEM-02: Use prompt caching parts when available, fall back to plain systemPrompt
  const completionOpts: LLMCompletionOptions = {
    temperature: 0.3,
    maxTokens: useSonnet ? 2048 : 1536,
    ...(!useSonnet ? { model: SEMANTIC_FAST_MODEL } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(narrativePrompt.parts
      ? { systemPromptParts: narrativePrompt.parts }
      : { systemPrompt: narrativePrompt.full }),
  };

  const response = await llm.complete(messages, completionOpts);
  const latencyMs = Date.now() - startMs;

  const parsed = parseNarrativeResponse(response.content);

  return {
    text: parsed.text,
    sections: parsed.sections,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs,
  };
}

/**
 * Streaming variant of `generateNarrative`. Identical setup but calls
 * `adapter.completeStreaming()` and yields narrative text chunks via `onChunk`.
 * Falls back to non-streaming `complete()` when the adapter doesn't support streaming.
 * Returns the full NarrativeResponse (same shape as non-streaming) for caching/eval.
 */
export async function generateNarrativeStreaming(
  result: QueryResult | null,
  intent: ResolvedIntent,
  originalMessage: string,
  context: IntentContext,
  onChunk: (text: string) => void,
  opts: GenerateNarrativeOptions = {},
): Promise<NarrativeResponse> {
  const llm = opts.adapter ?? getLLMAdapter();

  // If adapter has no streaming support, fall back to non-streaming
  if (!llm.completeStreaming) {
    return generateNarrative(result, intent, originalMessage, context, opts);
  }

  const narrativePrompt = await buildNarrativeSystemPrompt({
    lensSlug: opts.lensSlug,
    lensPromptFragment: opts.lensPromptFragment,
    metricDefs: opts.metricDefs,
    dimensionDefs: opts.dimensionDefs,
  });

  const intentSummary = intent.plan.intent ?? originalMessage;
  const dataSummary = buildDataSummary(result, intentSummary, opts.premaskedRows);

  const contentParts = [
    `## Original Question\n${originalMessage}`,
    `## Context\n- Date: ${context.currentDate}\n- Role: ${context.userRole}${context.locationId ? `\n- Location: ${context.locationId}` : ''}${context.timezone ? `\n- Timezone: ${context.timezone}` : ''}`,
    dataSummary,
  ];
  if (opts.plausibilityContext) {
    contentParts.push(opts.plausibilityContext);
  }

  const messages: LLMMessage[] = [
    { role: 'user', content: contentParts.join('\n\n') },
  ];

  const useSonnet = opts.fast === false;
  const startMs = Date.now();

  const completionOpts: LLMCompletionOptions = {
    temperature: 0.3,
    maxTokens: useSonnet ? 2048 : 1536,
    ...(!useSonnet ? { model: SEMANTIC_FAST_MODEL } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(narrativePrompt.parts
      ? { systemPromptParts: narrativePrompt.parts }
      : { systemPrompt: narrativePrompt.full }),
  };

  const response = await llm.completeStreaming(messages, onChunk, completionOpts);
  const latencyMs = Date.now() - startMs;

  const parsed = parseNarrativeResponse(response.content);

  return {
    text: parsed.text,
    sections: parsed.sections,
    tokensInput: response.tokensInput,
    tokensOutput: response.tokensOutput,
    latencyMs,
  };
}

// ── Empty result fallback ────────────────────────────────────────
// Static fallback used only when the LLM narrative call itself fails.
// Under normal operation, 0-row results go through generateNarrative.

export function buildEmptyResultNarrative(
  originalMessage: string,
  _context: IntentContext,
): NarrativeResponse {
  const text = [
    `## Answer`,
    `We don't have recorded data matching that query yet. This usually means either no transactions have been captured for the requested period, or the reporting system is still processing recent activity.`,
    '',
    `### Quick Wins`,
    `- **Check your date range** — if you just started, try "how many orders do I have?" (all-time) instead of a specific week`,
    `- **Try a broader question** — "show me my sales summary" or "what's my revenue?" works well as a starting point`,
    `- **Verify data exists** — ask "how many orders are in the system?" to confirm transactions are recorded`,
    '',
    `### Next Steps`,
    `Once transactions are flowing, I can help with trends, comparisons, top sellers, and much more. Want to try a different question?`,
    '',
    `---`,
    `*THE OPPS ERA LENS. Query: "${originalMessage}". No data returned — this may indicate the reporting pipeline hasn't processed events for this period yet.*`,
  ].join('\n');

  return {
    text,
    sections: [
      {
        type: 'answer',
        content: `We don't have recorded data matching that query yet. This usually means either no transactions have been captured for the requested period, or the reporting system is still processing recent activity.`,
      },
      {
        type: 'quick_wins',
        content: 'Try a broader question like "how many orders do I have?" or "show me my sales summary" to verify data exists.',
      },
      {
        type: 'conversation_driver',
        content: 'Once transactions are flowing, I can help with trends, comparisons, top sellers, and much more. Want to try a different question?',
      },
    ],
    tokensInput: 0,
    tokensOutput: 0,
    latencyMs: 0,
  };
}

/**
 * Fallback narrative when narrative LLM fails but data WAS returned.
 * Summarizes the actual query result rows so the user sees real data
 * instead of a misleading "no data found" message.
 */
export function buildDataFallbackNarrative(
  originalMessage: string,
  queryResult: QueryResult,
  premaskedRows?: Record<string, unknown>[],
): NarrativeResponse {
  const rows = queryResult.rows;
  const rowCount = queryResult.rowCount;

  // Build a simple textual summary from the first few rows
  const lines: string[] = [`## Answer`, ''];

  if (rowCount === 0) {
    // Shouldn't normally hit this path, but guard anyway
    return buildEmptyResultNarrative(originalMessage, {} as IntentContext);
  }

  lines.push(`Your query returned **${rowCount} result${rowCount === 1 ? '' : 's'}**. Here's a summary of the data:`);
  lines.push('');

  // Summarize up to 10 rows — use pre-masked rows from pipeline when available
  let sample: Record<string, unknown>[];
  if (premaskedRows && premaskedRows.length > 0) {
    sample = premaskedRows.slice(0, 10);
  } else {
    try {
      sample = maskRowsForLLM(rows.slice(0, 10));
    } catch {
      sample = rows.slice(0, 10);
    }
  }
  const keys = sample.length > 0 ? Object.keys(sample[0]!) : [];

  if (keys.length > 0 && sample.length > 0) {
    // Build a markdown table
    lines.push(`| ${keys.map(formatColumnName).join(' | ')} |`);
    lines.push(`| ${keys.map(() => '---').join(' | ')} |`);
    for (const row of sample) {
      const cells = keys.map((k) => formatCellValue(row[k]));
      lines.push(`| ${cells.join(' | ')} |`);
    }
    if (rowCount > 10) {
      lines.push('');
      lines.push(`*Showing 10 of ${rowCount} rows. Check the data table below for full results.*`);
    }
  }

  lines.push('');
  lines.push(`---`);
  lines.push(`*THE OPPS ERA LENS. Query: "${originalMessage}". ${rowCount} row${rowCount === 1 ? '' : 's'} returned.*`);

  const text = lines.join('\n');

  return {
    text,
    sections: [
      {
        type: 'answer',
        content: `Your query returned ${rowCount} result${rowCount === 1 ? '' : 's'}. See the data table for details.`,
      },
      {
        type: 'data_sources',
        content: `${rowCount} row${rowCount === 1 ? '' : 's'} returned.`,
      },
    ],
    tokensInput: 0,
    tokensOutput: 0,
    latencyMs: 0,
  };
}

/** Convert snake_case column names to Title Case */
function formatColumnName(col: string): string {
  return col
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a cell value for markdown table display */
function formatCellValue(value: unknown): string {
  if (value == null) return '-';
  // Postgres numeric columns come back as strings — parse them
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    if (Number.isInteger(num)) return num.toLocaleString('en-US');
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString('en-US');
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(value);
}

// ── Exports for testing ──────────────────────────────────────────

export { parseMarkdownNarrative as _parseMarkdownNarrative };
export { buildNarrativeSystemPrompt as _buildNarrativeSystemPrompt };
export { DEFAULT_PROMPT_TEMPLATE as _DEFAULT_PROMPT_TEMPLATE };
