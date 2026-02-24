/**
 * Analysis engine: column detection, data type inference, grouping key detection.
 *
 * Input: Parsed CSV (headers + sample rows)
 * Output: AnalysisResult with detected columns, data types, grouping candidates
 */

import type { ParsedCsv } from './csv-parser';
import { getColumnValues } from './csv-parser';

// ── Types ─────────────────────────────────────────────────────────────

export interface DetectedColumn {
  index: number;
  name: string;
  dataType: 'string' | 'number' | 'date' | 'currency' | 'boolean';
  uniqueCount: number;
  nullCount: number;
  sampleValues: string[];
  avgLength: number;
  /** Low cardinality relative to row count → likely a category/type column */
  isLowCardinality: boolean;
  /** Moderate cardinality → potential grouping key */
  isGroupingCandidate: boolean;
}

export interface AnalysisResult {
  columns: DetectedColumn[];
  suggestedGroupingKey: string | null;
  suggestedGroupingKeyIndex: number;
  detectedStructure: 'flat_rows' | 'header_lines' | 'multi_table';
  rowCount: number;
}

// ── Data Type Detection ───────────────────────────────────────────────

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/,                          // ISO: 2024-01-15
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/,            // ISO datetime
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,                  // US: 1/15/2024
  /^\d{1,2}-\d{1,2}-\d{2,4}$/,                    // US: 1-15-2024
  /^\d{1,2}\.\d{1,2}\.\d{2,4}$/,                  // EU: 15.01.2024
  /^\d{8}$/,                                        // Compact: 20240115
  /^[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4}$/,          // Jan 15, 2024
  /^\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}$/,            // 15 Jan 2024
];

const CURRENCY_PATTERN = /^-?\$?\s*[\d,]+\.?\d{0,2}$/;
const NUMBER_PATTERN = /^-?[\d,]*\.?\d+$/;
const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', '1', '0', 'y', 'n', 't', 'f']);

function inferDataType(values: string[]): 'string' | 'number' | 'date' | 'currency' | 'boolean' {
  const nonEmpty = values.filter((v) => v.length > 0);
  if (nonEmpty.length === 0) return 'string';

  // Check boolean first (small set of values)
  const boolCount = nonEmpty.filter((v) => BOOLEAN_VALUES.has(v.toLowerCase())).length;
  if (boolCount / nonEmpty.length > 0.9) return 'boolean';

  // Check date patterns
  const dateCount = nonEmpty.filter((v) => DATE_PATTERNS.some((p) => p.test(v))).length;
  if (dateCount / nonEmpty.length > 0.8) return 'date';

  // Check currency (has $ or ,### pattern)
  const currencyCount = nonEmpty.filter(
    (v) => CURRENCY_PATTERN.test(v) && (v.includes('$') || (v.includes(',') && v.includes('.'))),
  ).length;
  if (currencyCount / nonEmpty.length > 0.6) return 'currency';

  // Check pure number
  const numberCount = nonEmpty.filter((v) => NUMBER_PATTERN.test(v.replace(/[$,]/g, ''))).length;
  if (numberCount / nonEmpty.length > 0.8) return 'number';

  return 'string';
}

// ── Grouping Key Detection ────────────────────────────────────────────

const GROUPING_KEY_HINTS = [
  'transaction_id', 'trans_id', 'receipt_no', 'receipt_number', 'check_no',
  'check_number', 'order_id', 'order_no', 'order_number', 'invoice_no',
  'invoice_number', 'ticket_no', 'ticket_number', 'sale_id', 'sale_no',
  'transaction_number', 'trans_no', 'batch_id', 'ref_no', 'reference_no',
];

function isGroupingKeyCandidate(
  colName: string,
  uniqueCount: number,
  rowCount: number,
): boolean {
  const normalized = colName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  // Name-based hint — strong signal
  if (GROUPING_KEY_HINTS.includes(normalized)) return true;

  // Cardinality-based: moderate unique ratio (not 1:1, not very low)
  const ratio = uniqueCount / rowCount;
  return ratio > 0.05 && ratio < 0.8;
}

function pickBestGroupingKey(columns: DetectedColumn[], rowCount: number): number {
  // First pass: name-based hints
  for (const col of columns) {
    const normalized = col.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (GROUPING_KEY_HINTS.includes(normalized) && col.uniqueCount > 1) {
      return col.index;
    }
  }

  // Second pass: best cardinality ratio (target ~10-50% unique)
  let bestIdx = -1;
  let bestScore = 0;
  for (const col of columns) {
    if (col.dataType === 'boolean' || col.dataType === 'date') continue;
    if (col.nullCount > rowCount * 0.5) continue; // too many nulls

    const ratio = col.uniqueCount / rowCount;
    // Score peaks around 20% unique (typical order grouping)
    const score = ratio > 0.05 && ratio < 0.8
      ? 1 - Math.abs(ratio - 0.2) * 2
      : 0;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = col.index;
    }
  }

  return bestIdx;
}

// ── Main Analysis ─────────────────────────────────────────────────────

export function analyzeColumns(parsed: ParsedCsv, sampleRows?: string[][]): AnalysisResult {
  const rows = sampleRows ?? parsed.rows.slice(0, 200);
  const rowCount = parsed.rowCount;

  const columns: DetectedColumn[] = parsed.headers.map((header, index) => {
    const values = getColumnValues(rows, index);
    const nonEmpty = values.filter((v) => v.length > 0);
    const unique = new Set(nonEmpty);

    const dataType = inferDataType(values);
    const uniqueCount = unique.size;
    const nullCount = values.length - nonEmpty.length;
    const avgLength = nonEmpty.length > 0
      ? nonEmpty.reduce((sum, v) => sum + v.length, 0) / nonEmpty.length
      : 0;

    // Sample: up to 5 distinct non-empty values
    const sampleValues = [...unique].slice(0, 5);

    return {
      index,
      name: header,
      dataType,
      uniqueCount,
      nullCount,
      sampleValues,
      avgLength: Math.round(avgLength * 10) / 10,
      isLowCardinality: uniqueCount <= 10 && rowCount > 20,
      isGroupingCandidate: isGroupingKeyCandidate(header, uniqueCount, rowCount),
    };
  });

  const groupingKeyIndex = pickBestGroupingKey(columns, rowCount);

  return {
    columns,
    suggestedGroupingKey: groupingKeyIndex >= 0 ? parsed.headers[groupingKeyIndex]! : null,
    suggestedGroupingKeyIndex: groupingKeyIndex,
    detectedStructure: 'flat_rows', // V1: only flat rows supported
    rowCount,
  };
}
