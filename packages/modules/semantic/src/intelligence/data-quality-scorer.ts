// ── Data Quality Scorer ─────────────────────────────────────────
// Per-response data quality indicator. Pure function — no DB access.
// Scores a semantic pipeline response based on metadata about the
// data freshness, completeness, query confidence, execution quality,
// schema coverage, and timeliness. Returns a letter grade (A-F),
// a numeric score (0-100), and per-factor breakdowns.

// ── Types ──────────────────────────────────────────────────────────

export interface DataQualityInput {
  /** Number of rows returned by the query. */
  rowCount: number;
  /** Query execution time in milliseconds. */
  executionTimeMs: number;
  /** The date range queried, if any. */
  dateRange?: {
    start: string;
    end: string;
  };
  /** The compiled SQL (used to assess query complexity). */
  compiledSql?: string;
  /** Whether any compilation errors occurred. */
  compilationErrors?: string[];
  /** LLM intent resolver confidence (0-1). */
  llmConfidence?: number;
  /** Schema table names referenced by the query. */
  schemaTablesUsed?: string[];
  /** Total rows available in the primary table (for coverage assessment). */
  totalRowsInTable?: number;
  /** Whether the query timed out. */
  timedOut?: boolean;
}

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface QualityFactor {
  /** Human-readable factor name. */
  name: string;
  /** Score for this factor (0-100). */
  score: number;
  /** Weight of this factor in the overall score (0-1). */
  weight: number;
  /** Human-readable detail about the scoring rationale. */
  detail: string;
}

export interface DataQualityResult {
  /** Letter grade: A (excellent) through F (poor). */
  grade: QualityGrade;
  /** Numeric score (0-100). */
  score: number;
  /** Individual factor breakdowns contributing to the score. */
  factors: QualityFactor[];
  /** Human-readable summary of the quality assessment. */
  summary: string;
}

// ── Constants ──────────────────────────────────────────────────────

/** Factor weights (must sum to 1.0). */
const WEIGHTS = {
  freshness: 0.20,
  completeness: 0.20,
  queryConfidence: 0.20,
  executionQuality: 0.15,
  coverage: 0.15,
  timeliness: 0.10,
} as const;

/** Grade thresholds (lower bound inclusive). */
const GRADE_THRESHOLDS: Array<{ min: number; grade: QualityGrade }> = [
  { min: 90, grade: 'A' },
  { min: 75, grade: 'B' },
  { min: 60, grade: 'C' },
  { min: 40, grade: 'D' },
  { min: 0, grade: 'F' },
];

/** Known reporting read-model tables (authoritative data sources). */
const KNOWN_TABLES = new Set([
  'rm_daily_sales',
  'rm_item_sales',
  'rm_inventory_on_hand',
  'rm_customer_activity',
  'rm_fnb_server_performance',
  'rm_fnb_table_turns',
  'rm_fnb_kitchen_performance',
  'rm_fnb_daypart_sales',
  'rm_fnb_menu_mix',
  'rm_fnb_discount_comp_analysis',
  'rm_fnb_hourly_sales',
  'orders',
  'tenders',
  'catalog_items',
  'customers',
  'inventory_items',
  'inventory_movements',
]);

// ── Helpers ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(a: string, b: string): number {
  const dateA = new Date(a);
  const dateB = new Date(b);
  return Math.abs(dateB.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24);
}

function resolveGrade(score: number): QualityGrade {
  for (const threshold of GRADE_THRESHOLDS) {
    if (score >= threshold.min) return threshold.grade;
  }
  return 'F';
}

// ── Factor Scoring Functions ───────────────────────────────────────

/**
 * Data Freshness (weight: 0.20)
 *
 * Scores how recent the queried date range is relative to today.
 * Today's data = 100, this week = 90, this month = 70, older = 50.
 * If no date range is provided, defaults to 60 (uncertain freshness).
 */
function scoreFreshness(input: DataQualityInput): QualityFactor {
  const weight = WEIGHTS.freshness;

  if (!input.dateRange) {
    return {
      name: 'Data Freshness',
      score: 60,
      weight,
      detail: 'No date range specified. Freshness is uncertain.',
    };
  }

  const today = new Date().toISOString().split('T')[0]!;
  const endDaysAgo = daysBetween(input.dateRange.end, today);

  let score: number;
  let detail: string;

  if (endDaysAgo <= 1) {
    score = 100;
    detail = 'Data includes today or yesterday. Very fresh.';
  } else if (endDaysAgo <= 7) {
    score = 90;
    detail = `Data ends ${Math.round(endDaysAgo)} days ago. Recent (this week).`;
  } else if (endDaysAgo <= 30) {
    score = 70;
    detail = `Data ends ${Math.round(endDaysAgo)} days ago. Within the last month.`;
  } else if (endDaysAgo <= 90) {
    score = 50;
    detail = `Data ends ${Math.round(endDaysAgo)} days ago. Within the last quarter.`;
  } else {
    score = 30;
    detail = `Data ends ${Math.round(endDaysAgo)} days ago. Potentially stale.`;
  }

  return { name: 'Data Freshness', score, weight, detail };
}

/**
 * Completeness (weight: 0.20)
 *
 * Scores based on the number of rows returned. Zero rows indicates
 * a likely data gap; higher counts increase confidence that the
 * response is representative.
 */
function scoreCompleteness(input: DataQualityInput): QualityFactor {
  const weight = WEIGHTS.completeness;
  const { rowCount, totalRowsInTable } = input;

  if (rowCount === 0) {
    return {
      name: 'Completeness',
      score: 20,
      weight,
      detail: 'No rows returned. Query may not match any data or the data range may be empty.',
    };
  }

  // If we know the total rows, compute coverage percentage
  if (totalRowsInTable && totalRowsInTable > 0) {
    const coveragePct = (rowCount / totalRowsInTable) * 100;
    const score = clamp(70 + coveragePct * 0.3, 70, 100);
    return {
      name: 'Completeness',
      score: Math.round(score),
      weight,
      detail: `${rowCount.toLocaleString()} rows returned (${coveragePct.toFixed(1)}% of available data).`,
    };
  }

  // Without total context, score by absolute row count
  let score: number;
  let detail: string;

  if (rowCount >= 100) {
    score = 95;
    detail = `${rowCount.toLocaleString()} rows returned. Strong dataset.`;
  } else if (rowCount >= 30) {
    score = 85;
    detail = `${rowCount.toLocaleString()} rows returned. Good coverage.`;
  } else if (rowCount >= 7) {
    score = 75;
    detail = `${rowCount.toLocaleString()} rows returned. Moderate coverage.`;
  } else {
    score = 60;
    detail = `${rowCount.toLocaleString()} rows returned. Limited data — interpret with caution.`;
  }

  return { name: 'Completeness', score, weight, detail };
}

/**
 * Query Confidence (weight: 0.20)
 *
 * Directly maps the LLM intent resolver's confidence score (0-1)
 * to 0-100. Lower confidence means the LLM was less certain about
 * interpreting the user's question into a query plan.
 */
function scoreQueryConfidence(input: DataQualityInput): QualityFactor {
  const weight = WEIGHTS.queryConfidence;

  if (input.llmConfidence == null) {
    return {
      name: 'Query Confidence',
      score: 70,
      weight,
      detail: 'LLM confidence not available. Assuming moderate confidence.',
    };
  }

  const score = Math.round(clamp(input.llmConfidence * 100, 0, 100));

  let qualifier: string;
  if (score >= 90) qualifier = 'Very high';
  else if (score >= 70) qualifier = 'High';
  else if (score >= 50) qualifier = 'Moderate';
  else if (score >= 30) qualifier = 'Low';
  else qualifier = 'Very low';

  return {
    name: 'Query Confidence',
    score,
    weight,
    detail: `${qualifier} confidence (${(input.llmConfidence * 100).toFixed(0)}%) in query interpretation.`,
  };
}

/**
 * Execution Quality (weight: 0.15)
 *
 * Scores based on whether the query compiled and executed without
 * errors. Compilation errors or timeouts significantly reduce quality.
 */
function scoreExecutionQuality(input: DataQualityInput): QualityFactor {
  const weight = WEIGHTS.executionQuality;

  if (input.timedOut) {
    return {
      name: 'Execution Quality',
      score: 0,
      weight,
      detail: 'Query timed out. Results may be incomplete or absent.',
    };
  }

  if (input.compilationErrors && input.compilationErrors.length > 0) {
    const errorCount = input.compilationErrors.length;
    return {
      name: 'Execution Quality',
      score: 40,
      weight,
      detail: `${errorCount} compilation error${errorCount > 1 ? 's' : ''} encountered. Results may use fallback logic.`,
    };
  }

  return {
    name: 'Execution Quality',
    score: 100,
    weight,
    detail: 'Query compiled and executed without errors.',
  };
}

/**
 * Coverage (weight: 0.15)
 *
 * Scores based on the schema tables used. Known read-model tables
 * (rm_*) are authoritative and score highest. Queries using multiple
 * authoritative tables score higher than single-table queries.
 */
function scoreCoverage(input: DataQualityInput): QualityFactor {
  const weight = WEIGHTS.coverage;

  if (!input.schemaTablesUsed || input.schemaTablesUsed.length === 0) {
    // If no tables were tracked, check if compiled SQL exists
    if (input.compiledSql) {
      return {
        name: 'Coverage',
        score: 60,
        weight,
        detail: 'Query used raw SQL. Table coverage could not be assessed.',
      };
    }
    return {
      name: 'Coverage',
      score: 40,
      weight,
      detail: 'No table references detected. May be using advisor mode without data.',
    };
  }

  const tables = input.schemaTablesUsed;
  const knownCount = tables.filter((t) => KNOWN_TABLES.has(t)).length;
  const rmCount = tables.filter((t) => t.startsWith('rm_')).length;

  let score: number;
  let detail: string;

  if (rmCount >= 2) {
    score = 100;
    detail = `Uses ${rmCount} read-model tables across ${tables.length} total. Excellent coverage.`;
  } else if (rmCount >= 1) {
    score = 90;
    detail = `Uses ${rmCount} read-model table and ${tables.length} total. Good coverage.`;
  } else if (knownCount >= 2) {
    score = 80;
    detail = `Uses ${knownCount} known tables. Solid coverage from operational data.`;
  } else if (knownCount === 1) {
    score = 70;
    detail = `Uses 1 known table. Single-source data.`;
  } else {
    score = 50;
    detail = `Uses ${tables.length} table${tables.length > 1 ? 's' : ''}, none from the known authoritative set.`;
  }

  return { name: 'Coverage', score, weight, detail };
}

/**
 * Timeliness (weight: 0.10)
 *
 * Scores based on query execution time. Faster responses indicate
 * well-optimized queries hitting indexed paths.
 */
function scoreTimeliness(input: DataQualityInput): QualityFactor {
  const weight = WEIGHTS.timeliness;
  const ms = input.executionTimeMs;

  let score: number;
  let detail: string;

  if (ms < 500) {
    score = 100;
    detail = `Executed in ${ms}ms. Excellent performance.`;
  } else if (ms < 2000) {
    score = 80;
    detail = `Executed in ${(ms / 1000).toFixed(1)}s. Good performance.`;
  } else if (ms < 5000) {
    score = 50;
    detail = `Executed in ${(ms / 1000).toFixed(1)}s. Acceptable but slow.`;
  } else {
    score = 20;
    detail = `Executed in ${(ms / 1000).toFixed(1)}s. Very slow — may indicate complex aggregation or missing indexes.`;
  }

  return { name: 'Timeliness', score, weight, detail };
}

// ── Summary Generator ──────────────────────────────────────────────

function generateSummary(grade: QualityGrade, score: number, factors: QualityFactor[], input: DataQualityInput): string {
  const gradeDescriptions: Record<QualityGrade, string> = {
    A: 'High confidence',
    B: 'Good confidence',
    C: 'Moderate confidence',
    D: 'Low confidence',
    F: 'Very low confidence',
  };

  const parts: string[] = [`Grade ${grade} -- ${gradeDescriptions[grade]}`];

  // Add highlights from factors
  const dateInfo = input.dateRange
    ? `data from ${input.dateRange.start} to ${input.dateRange.end}`
    : 'no specific date range';

  const tableInfo = input.schemaTablesUsed && input.schemaTablesUsed.length > 0
    ? `${input.schemaTablesUsed.length} table${input.schemaTablesUsed.length > 1 ? 's' : ''}`
    : 'unknown tables';

  const rowInfo = input.rowCount > 0
    ? `${input.rowCount.toLocaleString()} rows returned`
    : 'no rows returned';

  const timeInfo = `${input.executionTimeMs < 1000 ? `${input.executionTimeMs}ms` : `${(input.executionTimeMs / 1000).toFixed(1)}s`}`;

  parts.push(`${dateInfo}, ${tableInfo}, ${rowInfo} in ${timeInfo}.`);

  // Flag any weak factors
  const weakFactors = factors.filter((f) => f.score < 50);
  if (weakFactors.length > 0) {
    const weakNames = weakFactors.map((f) => f.name.toLowerCase()).join(', ');
    parts.push(`Areas of concern: ${weakNames}.`);
  }

  return parts.join(' ');
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Scores the data quality of a semantic pipeline response based on
 * response metadata. This is a **pure function** with no database
 * access — it evaluates quality indicators from the pipeline output.
 *
 * The score is computed from 6 weighted factors:
 *
 * | Factor            | Weight | What it measures                                    |
 * |-------------------|--------|-----------------------------------------------------|
 * | Data Freshness    | 0.20   | How recent the queried date range is                |
 * | Completeness      | 0.20   | Number of rows returned (data coverage)             |
 * | Query Confidence  | 0.20   | LLM intent resolver confidence                     |
 * | Execution Quality | 0.15   | Whether compilation/execution had errors            |
 * | Coverage          | 0.15   | Number and type of schema tables used               |
 * | Timeliness        | 0.10   | Query execution speed                               |
 *
 * Grade thresholds: A >= 90, B >= 75, C >= 60, D >= 40, F < 40.
 *
 * @param input - Metadata about the query and its result.
 * @returns Quality grade, numeric score, per-factor breakdowns, and summary.
 */
export function scoreDataQuality(input: DataQualityInput): DataQualityResult {
  // Compute each factor
  const factors: QualityFactor[] = [
    scoreFreshness(input),
    scoreCompleteness(input),
    scoreQueryConfidence(input),
    scoreExecutionQuality(input),
    scoreCoverage(input),
    scoreTimeliness(input),
  ];

  // Compute weighted overall score
  const rawScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
  const score = Math.round(clamp(rawScore, 0, 100));
  const grade = resolveGrade(score);

  // Generate summary
  const summary = generateSummary(grade, score, factors, input);

  return { grade, score, factors, summary };
}
