import type { QueryResult } from '../llm/types';
import type { QueryPlan } from '../compiler/types';

// ── SEM-09: Query Plausibility Checker ────────────────────────────
// Post-execution validation that detects suspicious or implausible
// query results. Returns warnings that the narrative layer can use
// to add caveats, and the pipeline uses for quality scoring.

export interface PlausibilityWarning {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface PlausibilityResult {
  plausible: boolean;
  warnings: PlausibilityWarning[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

/**
 * Checks the plausibility of SQL query results.
 * Runs heuristic checks on column names + values to detect
 * anomalies that might indicate a bad query or data issue.
 */
export function checkPlausibility(
  result: QueryResult | null,
  plan: QueryPlan | null,
  currentDate: string,
): PlausibilityResult {
  const warnings: PlausibilityWarning[] = [];

  if (!result || result.rowCount === 0) {
    return { plausible: true, warnings: [], grade: 'A' };
  }

  const { rows } = result;
  if (rows.length === 0) {
    return { plausible: true, warnings: [], grade: 'A' };
  }

  const columns = Object.keys(rows[0]!);

  // ── Check 1: Negative monetary values ──────────────────────
  for (const col of columns) {
    if (!isMonetaryColumn(col)) continue;
    const negCount = rows.filter((r) => {
      const v = Number(r[col]);
      return Number.isFinite(v) && v < 0;
    }).length;
    if (negCount > 0 && negCount === rows.length) {
      warnings.push({
        code: 'ALL_NEGATIVE_MONEY',
        severity: 'warning',
        message: `All ${rows.length} values in "${col}" are negative — this may indicate reversed signs or voided records.`,
      });
    } else if (negCount > rows.length * 0.5) {
      warnings.push({
        code: 'MAJORITY_NEGATIVE_MONEY',
        severity: 'info',
        message: `${negCount} of ${rows.length} values in "${col}" are negative — unusual for monetary data.`,
      });
    }
  }

  // ── Check 2: Future dates ──────────────────────────────────
  const today = new Date(currentDate + 'T23:59:59Z');
  for (const col of columns) {
    if (!isDateColumn(col)) continue;
    const futureCount = rows.filter((r) => {
      const v = r[col];
      if (!v || typeof v !== 'string') return false;
      const d = new Date(v);
      return !isNaN(d.getTime()) && d > today;
    }).length;
    if (futureCount > 0) {
      warnings.push({
        code: 'FUTURE_DATES',
        severity: 'warning',
        message: `${futureCount} row${futureCount > 1 ? 's have' : ' has'} "${col}" in the future — results may include forecast or erroneous data.`,
      });
    }
  }

  // ── Check 3: Suspiciously high values ──────────────────────
  for (const col of columns) {
    if (!isMonetaryColumn(col)) continue;
    const vals = rows
      .map((r) => Number(r[col]))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (vals.length < 2) continue;

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const stdDev = Math.sqrt(
      vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length,
    );

    if (stdDev === 0) continue;

    const outliers = vals.filter((v) => Math.abs(v - mean) > 3 * stdDev);
    if (outliers.length > 0) {
      warnings.push({
        code: 'STATISTICAL_OUTLIERS',
        severity: 'info',
        message: `${outliers.length} value${outliers.length > 1 ? 's' : ''} in "${col}" ${outliers.length > 1 ? 'are' : 'is'} more than 3σ from the mean — may be outlier${outliers.length > 1 ? 's' : ''} or data issue${outliers.length > 1 ? 's' : ''}.`,
      });
    }
  }

  // ── Check 4: All-null columns ──────────────────────────────
  for (const col of columns) {
    const allNull = rows.every((r) => r[col] == null);
    if (allNull && rows.length >= 3) {
      warnings.push({
        code: 'ALL_NULL_COLUMN',
        severity: 'info',
        message: `Column "${col}" is entirely NULL across ${rows.length} rows — this column may not be populated yet.`,
      });
    }
  }

  // ── Check 5: Duplicate rows ────────────────────────────────
  if (rows.length >= 5) {
    const seen = new Set<string>();
    let dupeCount = 0;
    for (const row of rows) {
      const key = JSON.stringify(row);
      if (seen.has(key)) dupeCount++;
      else seen.add(key);
    }
    if (dupeCount > rows.length * 0.3) {
      warnings.push({
        code: 'HIGH_DUPLICATE_RATE',
        severity: 'warning',
        message: `${dupeCount} of ${rows.length} rows are duplicates — the query may have a missing GROUP BY or JOIN issue.`,
      });
    }
  }

  // ── Check 6: Date range mismatch ───────────────────────────
  if (plan?.dateRange) {
    const dateCol = columns.find(isDateColumn);
    if (dateCol) {
      const dates = rows
        .map((r) => r[dateCol])
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.slice(0, 10)); // YYYY-MM-DD

      const outOfRange = dates.filter(
        (d) => d < plan.dateRange!.start || d > plan.dateRange!.end,
      );
      if (outOfRange.length > 0) {
        warnings.push({
          code: 'DATE_RANGE_MISMATCH',
          severity: 'warning',
          message: `${outOfRange.length} row${outOfRange.length > 1 ? 's have' : ' has'} dates outside the requested range (${plan.dateRange!.start} to ${plan.dateRange!.end}).`,
        });
      }
    }
  }

  // ── Check 7: Percentage values out of range ────────────────
  for (const col of columns) {
    if (!isPercentColumn(col)) continue;
    const outOfRange = rows.filter((r) => {
      const v = Number(r[col]);
      return Number.isFinite(v) && (v < 0 || v > 100);
    });
    if (outOfRange.length > 0) {
      warnings.push({
        code: 'PERCENT_OUT_OF_RANGE',
        severity: 'warning',
        message: `${outOfRange.length} value${outOfRange.length > 1 ? 's' : ''} in "${col}" ${outOfRange.length > 1 ? 'are' : 'is'} outside 0–100% range.`,
      });
    }
  }

  // ── Compute grade ──────────────────────────────────────────
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warningCount = warnings.filter((w) => w.severity === 'warning').length;
  const infoCount = warnings.filter((w) => w.severity === 'info').length;

  let grade: PlausibilityResult['grade'];
  if (errorCount > 0) grade = 'F';
  else if (warningCount >= 3) grade = 'D';
  else if (warningCount >= 2) grade = 'C';
  else if (warningCount >= 1 || infoCount >= 3) grade = 'B';
  else grade = 'A';

  return {
    plausible: errorCount === 0 && warningCount <= 1,
    warnings,
    grade,
  };
}

// ── Column type heuristics ───────────────────────────────────────

const MONEY_PATTERNS = [
  'amount', 'total', 'revenue', 'sales', 'cost', 'price',
  'spend', 'balance', 'payment', 'fee', 'charge', 'discount',
  'net_sales', 'gross_sales', 'avg_order_value', 'adr', 'revpar',
];

function isMonetaryColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return MONEY_PATTERNS.some((p) => lower.includes(p));
}

const DATE_PATTERNS = ['date', 'day', 'month', 'week', 'period', 'created_at', 'updated_at'];

function isDateColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return DATE_PATTERNS.some((p) => lower.includes(p));
}

const PERCENT_PATTERNS = ['rate', 'percent', 'pct', 'ratio', 'margin'];

function isPercentColumn(col: string): boolean {
  const lower = col.toLowerCase();
  return PERCENT_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Build a concise summary string of plausibility warnings
 * suitable for injection into the narrative prompt.
 */
export function formatPlausibilityForNarrative(result: PlausibilityResult): string | null {
  if (result.warnings.length === 0) return null;

  const lines = result.warnings
    .filter((w) => w.severity !== 'info') // only warnings + errors for narrative
    .map((w) => `- ${w.message}`);

  if (lines.length === 0) return null;

  return `## Data Quality Warnings\nThe following potential issues were detected in the query results:\n${lines.join('\n')}`;
}
