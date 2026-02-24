// ── Natural Language Report Builder ──────────────────────────────
// Translates a free-form text description (e.g., "Build me a weekly
// sales report showing top 10 items by revenue") into a structured
// report definition that can be saved via the reporting module's
// saveReport() command. Uses the field catalog as the source of
// truth for valid dimensions and measures.

import { getLLMAdapter } from '../llm/adapters/anthropic';
import type { LLMAdapter, LLMMessage } from '../llm/types';
import { LLMError } from '../llm/types';

// ── Types ──────────────────────────────────────────────────────────

/** A single entry from the reporting field catalog. */
export interface FieldCatalogEntry {
  /** Unique slug identifying the field (e.g., 'net_sales', 'business_date'). */
  slug: string;
  /** Human-readable display name. */
  displayName: string;
  /** Whether this field is a dimension (grouping) or measure (aggregation). */
  fieldType: 'dimension' | 'measure';
  /** The underlying data type. */
  dataType: string;
}

/** A filter condition in the report definition. */
export interface ReportFilter {
  /** Field slug to filter on. */
  field: string;
  /** Filter operator. */
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'not_in' | 'like' | 'last_n_days' | 'last_n_weeks' | 'last_n_months' | 'is_null' | 'is_not_null';
  /** The filter value (interpretation depends on operator). */
  value: string;
}

/** A draft report definition ready to be saved via saveReport(). */
export interface DraftReportDef {
  /** Suggested report name. */
  name: string;
  /** Human-readable description of what the report shows. */
  description: string;
  /** Dimension field slugs to group by. */
  dimensions: string[];
  /** Measure field slugs to aggregate. */
  measures: string[];
  /** Filter conditions. */
  filters: ReportFilter[];
  /** Recommended chart type. */
  chartType: 'line' | 'bar' | 'table' | 'metric';
  /** Date range for the report (if applicable). */
  dateRange: { start: string; end: string } | null;
  /** Sort column slug (optional). */
  sortBy: string | null;
  /** Sort direction (optional). */
  sortDir: 'asc' | 'desc' | null;
  /** Row limit (optional). */
  limit: number | null;
}

/** The result of building a report from natural language. */
export interface NLReportResult {
  /** The draft report definition ready for persistence. */
  reportDefinition: DraftReportDef;
  /** Human-readable explanation of the generated report structure. */
  explanation: string;
  /** Confidence score (0-1) in the mapping accuracy. */
  confidence: number;
}

/** Context required for NL report building. */
export interface NLReportContext {
  /** Available fields from the reporting field catalog. */
  fieldCatalog: FieldCatalogEntry[];
  /** Names of existing reports (for deduplication hints). */
  existingReports?: string[];
  /** Optional LLM adapter override (for testing). */
  adapter?: LLMAdapter;
}

// ── Prompt builder ─────────────────────────────────────────────────

function buildNLReportPrompt(
  fieldCatalog: FieldCatalogEntry[],
  existingReports: string[],
): string {
  const dimensions = fieldCatalog
    .filter((f) => f.fieldType === 'dimension')
    .map((f) => `- ${f.slug} (${f.displayName}, ${f.dataType})`)
    .join('\n');

  const measures = fieldCatalog
    .filter((f) => f.fieldType === 'measure')
    .map((f) => `- ${f.slug} (${f.displayName}, ${f.dataType})`)
    .join('\n');

  const existingSection = existingReports.length > 0
    ? `\n## Existing Reports (avoid duplicate names)\n${existingReports.map((r) => `- ${r}`).join('\n')}\n`
    : '';

  return `You are a report configuration assistant for OppsEra, a multi-tenant SaaS ERP platform.

Your job: translate a natural-language report description into a structured report definition
using ONLY the available fields from the field catalog below.

## Output Contract
Respond with a single JSON object — no markdown fences, no prose before/after:
{
  "name": "Weekly Top Items by Revenue",
  "description": "Shows the top 10 items by net sales over the last 7 days",
  "dimensions": ["business_date", "item_name"],
  "measures": ["net_sales", "quantity_sold"],
  "filters": [
    { "field": "business_date", "operator": "last_n_days", "value": "7" }
  ],
  "chartType": "bar",
  "dateRange": null,
  "sortBy": "net_sales",
  "sortDir": "desc",
  "limit": 10,
  "confidence": 0.9,
  "explanation": "This report groups sales by date and item name, sorted by revenue descending."
}

## Available Dimensions
${dimensions}

## Available Measures
${measures}
${existingSection}
## Rules
1. Only use field slugs that appear in the catalogs above.
2. Every report MUST include at least one measure.
3. Every report SHOULD include at least one dimension (unless it's a single-metric card).
4. For time-series reports, include a date dimension and appropriate date filter.
5. chartType: "line" for time series, "bar" for comparisons/rankings, "table" for detailed lists, "metric" for single KPIs.
6. Common date filters: "last_n_days" (value: "7", "30", "90"), "last_n_weeks", "last_n_months".
7. If the user mentions "top N", set limit to N and sortDir to "desc".
8. If the user mentions "bottom N", set limit to N and sortDir to "asc".
9. If the user mentions a specific date range, use "between" operator with "start|end" in value.
10. confidence: 0.9+ if all terms map clearly, 0.7-0.9 if some inference needed, <0.7 if guessing.
11. Suggest a clear, concise name (max 60 chars) and description (max 200 chars).

Respond ONLY with the JSON object.`;
}

// ── JSON parser ────────────────────────────────────────────────────

interface RawNLReportResponse {
  name: string;
  description: string;
  dimensions: string[];
  measures: string[];
  filters: ReportFilter[];
  chartType: string;
  dateRange: { start: string; end: string } | null;
  sortBy: string | null;
  sortDir: string | null;
  limit: number | null;
  confidence: number;
  explanation: string;
}

function parseNLReportResponse(raw: string): RawNLReportResponse {
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
      `NL report builder returned non-JSON: ${cleaned.slice(0, 200)}`,
      'PARSE_ERROR',
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new LLMError('NL report builder response is not an object', 'PARSE_ERROR');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  if (!Array.isArray(obj.measures) || obj.measures.length === 0) {
    throw new LLMError('NL report builder response missing measures array', 'PARSE_ERROR');
  }

  return {
    name: typeof obj.name === 'string' ? obj.name : 'Untitled Report',
    description: typeof obj.description === 'string' ? obj.description : '',
    dimensions: Array.isArray(obj.dimensions) ? obj.dimensions.filter((d): d is string => typeof d === 'string') : [],
    measures: obj.measures.filter((m): m is string => typeof m === 'string'),
    filters: Array.isArray(obj.filters)
      ? obj.filters
          .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
          .map((f) => ({
            field: String(f.field ?? ''),
            operator: String(f.operator ?? 'eq') as ReportFilter['operator'],
            value: String(f.value ?? ''),
          }))
      : [],
    chartType: typeof obj.chartType === 'string' ? obj.chartType : 'table',
    dateRange: obj.dateRange && typeof obj.dateRange === 'object'
      ? {
          start: String((obj.dateRange as Record<string, unknown>).start ?? ''),
          end: String((obj.dateRange as Record<string, unknown>).end ?? ''),
        }
      : null,
    sortBy: typeof obj.sortBy === 'string' ? obj.sortBy : null,
    sortDir: typeof obj.sortDir === 'string' ? obj.sortDir : null,
    limit: typeof obj.limit === 'number' ? obj.limit : null,
    confidence: typeof obj.confidence === 'number'
      ? Math.min(1, Math.max(0, obj.confidence))
      : 0.5,
    explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
  };
}

// ── Validation ─────────────────────────────────────────────────────

/**
 * Validates that all field slugs in the report definition exist in the
 * field catalog. Removes any invalid slugs and adjusts confidence.
 */
function validateAgainstCatalog(
  raw: RawNLReportResponse,
  fieldCatalog: FieldCatalogEntry[],
): { validated: RawNLReportResponse; warnings: string[] } {
  const slugSet = new Set(fieldCatalog.map((f) => f.slug));
  const warnings: string[] = [];

  const validDimensions = raw.dimensions.filter((d) => {
    if (!slugSet.has(d)) {
      warnings.push(`Dimension "${d}" not found in field catalog — removed.`);
      return false;
    }
    return true;
  });

  const validMeasures = raw.measures.filter((m) => {
    if (!slugSet.has(m)) {
      warnings.push(`Measure "${m}" not found in field catalog — removed.`);
      return false;
    }
    return true;
  });

  const validFilters = raw.filters.filter((f) => {
    if (!slugSet.has(f.field)) {
      warnings.push(`Filter field "${f.field}" not found in field catalog — removed.`);
      return false;
    }
    return true;
  });

  // Validate sortBy
  const validSortBy = raw.sortBy && slugSet.has(raw.sortBy) ? raw.sortBy : null;
  if (raw.sortBy && !validSortBy) {
    warnings.push(`Sort field "${raw.sortBy}" not found in field catalog — removed.`);
  }

  // If we removed fields, lower confidence
  const removedCount = (raw.dimensions.length - validDimensions.length)
    + (raw.measures.length - validMeasures.length)
    + (raw.filters.length - validFilters.length);

  const adjustedConfidence = removedCount > 0
    ? Math.max(0.1, raw.confidence - (removedCount * 0.15))
    : raw.confidence;

  // Must have at least one measure after validation
  if (validMeasures.length === 0) {
    // Fall back to the first available measure
    const fallbackMeasure = fieldCatalog.find((f) => f.fieldType === 'measure');
    if (fallbackMeasure) {
      validMeasures.push(fallbackMeasure.slug);
      warnings.push(`No valid measures after validation — defaulted to "${fallbackMeasure.slug}".`);
    }
  }

  return {
    validated: {
      ...raw,
      dimensions: validDimensions,
      measures: validMeasures,
      filters: validFilters,
      sortBy: validSortBy,
      confidence: adjustedConfidence,
    },
    warnings,
  };
}

// ── Chart type normalization ───────────────────────────────────────

function normalizeChartType(chartType: string): 'line' | 'bar' | 'table' | 'metric' {
  const lower = chartType.toLowerCase();
  if (lower === 'line') return 'line';
  if (lower === 'bar') return 'bar';
  if (lower === 'metric' || lower === 'metric_card' || lower === 'kpi') return 'metric';
  return 'table';
}

// ── Sort direction normalization ───────────────────────────────────

function normalizeSortDir(dir: string | null): 'asc' | 'desc' | null {
  if (!dir) return null;
  const lower = dir.toLowerCase();
  if (lower === 'asc') return 'asc';
  if (lower === 'desc') return 'desc';
  return null;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Builds a structured report definition from a natural-language description.
 *
 * The builder:
 * 1. Sends the description + field catalog to the LLM
 * 2. Parses the LLM's JSON response into a draft report definition
 * 3. Validates all field slugs against the catalog (removes unknowns)
 * 4. Returns the validated draft ready for saveReport()
 *
 * @param tenantId - The tenant requesting the report
 * @param description - Natural-language description of the desired report
 * @param context - Field catalog and optional existing report names
 * @returns NLReportResult with the draft definition, explanation, and confidence
 */
export async function buildReportFromNL(
  tenantId: string,
  description: string,
  context: NLReportContext,
): Promise<NLReportResult> {
  const llm = context.adapter ?? getLLMAdapter();
  const { fieldCatalog, existingReports = [] } = context;

  // Build the system prompt with available fields
  const systemPrompt = buildNLReportPrompt(fieldCatalog, existingReports);

  const messages: LLMMessage[] = [
    {
      role: 'user',
      content: `Build a report from this description:\n\n"${description}"\n\nRespond ONLY with the JSON object. No prose.`,
    },
  ];

  const response = await llm.complete(messages, {
    systemPrompt,
    temperature: 0,
    maxTokens: 2048,
  });

  // Parse the LLM response
  const raw = parseNLReportResponse(response.content);

  // Validate all field slugs against the catalog
  const { validated, warnings } = validateAgainstCatalog(raw, fieldCatalog);

  // Build the explanation with any validation warnings
  let explanation = validated.explanation;
  if (warnings.length > 0) {
    explanation += `\n\nValidation notes:\n${warnings.map((w) => `- ${w}`).join('\n')}`;
  }

  const reportDefinition: DraftReportDef = {
    name: validated.name,
    description: validated.description,
    dimensions: validated.dimensions,
    measures: validated.measures,
    filters: validated.filters,
    chartType: normalizeChartType(validated.chartType),
    dateRange: validated.dateRange,
    sortBy: validated.sortBy,
    sortDir: normalizeSortDir(validated.sortDir),
    limit: validated.limit,
  };

  return {
    reportDefinition,
    explanation,
    confidence: validated.confidence,
  };
}
