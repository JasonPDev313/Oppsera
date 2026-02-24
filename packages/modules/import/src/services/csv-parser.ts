/**
 * Streaming-capable CSV/TSV parser with flexible handling.
 *
 * Reuses proven patterns from the COA CSV import (accounting module):
 * - BOM stripping
 * - RFC 4180 quoted field handling
 * - Flexible delimiters (comma, tab, semicolon)
 * - Whitespace trimming
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
  rowCount: number;
}

// ── BOM Handling ──────────────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ── Delimiter Detection ───────────────────────────────────────────────

const CANDIDATE_DELIMITERS = [',', '\t', ';', '|'];

function detectDelimiter(headerLine: string): string {
  let bestDelimiter = ',';
  let bestCount = 0;

  for (const d of CANDIDATE_DELIMITERS) {
    // Count occurrences outside quoted fields
    let count = 0;
    let inQuotes = false;
    for (const char of headerLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = d;
    }
  }

  return bestDelimiter;
}

// ── Line Parser ───────────────────────────────────────────────────────

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Row-Type Prefix Detection ─────────────────────────────────────────

const ROW_TYPE_HEADER_MARKERS = new Set(['hdr', 'rec', 'record_type', 'recordtype', 'row_type', 'rowtype', 'type']);

function detectRowTypePrefix(headers: string[], firstFewRows: string[][]): boolean {
  if (headers.length < 2) return false;
  const firstHeader = headers[0]!.toLowerCase().trim();
  if (!ROW_TYPE_HEADER_MARKERS.has(firstHeader)) return false;
  if (firstFewRows.length === 0) return false;
  const prefixRe = /^[A-Z]{1,6}$/;
  const firstVal = firstFewRows[0]?.[0]?.trim() ?? '';
  if (!prefixRe.test(firstVal)) return false;
  const matchCount = firstFewRows.filter((r) => (r[0]?.trim() ?? '') === firstVal).length;
  return matchCount / firstFewRows.length >= 0.8;
}

// ── Main Parser ───────────────────────────────────────────────────────

const MAX_CSV_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_ROW_COUNT = 1_100_000; // ~1.1M rows (buffer over 1M limit)

export function parseCsv(csvContent: string): ParsedCsv {
  if (csvContent.length > MAX_CSV_SIZE) {
    throw new Error(`CSV exceeds ${MAX_CSV_SIZE / (1024 * 1024)}MB size limit`);
  }

  const raw = stripBom(csvContent).trim();
  const lines = raw.split(/\r?\n/);

  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row');
  }

  if (lines.length > MAX_ROW_COUNT) {
    throw new Error(`CSV has ${lines.length - 1} data rows (max ${MAX_ROW_COUNT - 1})`);
  }

  const headerLine = lines[0]!;
  const delimiter = detectDelimiter(headerLine);
  const headers = parseLine(headerLine, delimiter);

  if (headers.length < 2) {
    throw new Error('CSV must have at least 2 columns');
  }

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue; // skip blank lines
    const values = parseLine(line, delimiter);
    // Pad short rows with empty strings
    while (values.length < headers.length) values.push('');
    rows.push(values);
  }

  // Detect and strip row-type prefix column (e.g., HDR/CU from legacy system exports)
  let finalHeaders = headers;
  let finalRows = rows;
  if (detectRowTypePrefix(headers, rows.slice(0, 10))) {
    finalHeaders = headers.slice(1);
    finalRows = rows.map((r) => r.slice(1));
  }

  return {
    headers: finalHeaders,
    rows: finalRows,
    delimiter,
    rowCount: finalRows.length,
  };
}

// ── Sample Extractor ──────────────────────────────────────────────────

/**
 * Extract first N rows for analysis (avoids loading full dataset into memory for analysis).
 */
export function extractSampleRows(parsed: ParsedCsv, count = 100): string[][] {
  return parsed.rows.slice(0, count);
}

/**
 * Get column values from parsed rows.
 */
export function getColumnValues(rows: string[][], colIndex: number): string[] {
  return rows.map((row) => row[colIndex] ?? '');
}
