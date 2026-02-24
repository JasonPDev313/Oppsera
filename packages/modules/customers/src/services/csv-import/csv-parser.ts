/**
 * RFC 4180 CSV/TSV parser with BOM handling.
 * Follows the pattern from accounting's csv-import.ts.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 10_000;

// ── BOM stripping ───────────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

// ── Line parser (RFC 4180) ──────────────────────────────────────────

function parseCsvLine(line: string, delimiter: string): string[] {
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

// ── Delimiter detection ─────────────────────────────────────────────

export function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  return tabCount > commaCount ? '\t' : ',';
}

// ── Parse Result ────────────────────────────────────────────────────

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
  totalRows: number;
}

export interface ParseError {
  message: string;
}

// ── Row-Type Prefix Detection ───────────────────────────────────────

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

// ── Main Parser ─────────────────────────────────────────────────────

export function parseCsvContent(
  csvContent: string,
): { data: ParsedCsv } | { error: ParseError } {
  // Size guard
  if (csvContent.length > MAX_FILE_SIZE) {
    return { error: { message: `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` } };
  }

  // Strip BOM and split
  const raw = stripBom(csvContent).trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);

  if (lines.length < 2) {
    return { error: { message: 'File must contain a header row and at least one data row' } };
  }

  if (lines.length - 1 > MAX_ROWS) {
    return { error: { message: `File has ${lines.length - 1} rows (max ${MAX_ROWS.toLocaleString()})` } };
  }

  // Detect delimiter from header
  const delimiter = detectDelimiter(lines[0]!);

  // Parse header
  const headers = parseCsvLine(lines[0]!, delimiter);

  if (headers.length < 2) {
    return { error: { message: 'File must have at least 2 columns' } };
  }

  // Parse data rows
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]!, delimiter);
    // Skip completely empty rows
    if (row.every((cell) => !cell)) continue;
    rows.push(row);
  }

  if (rows.length === 0) {
    return { error: { message: 'No data rows found after header' } };
  }

  // Detect and strip row-type prefix column (e.g., HDR/CU from legacy system exports)
  let finalHeaders = headers;
  let finalRows = rows;
  if (detectRowTypePrefix(headers, rows.slice(0, 10))) {
    finalHeaders = headers.slice(1);
    finalRows = rows.map((r) => r.slice(1));
  }

  return {
    data: {
      headers: finalHeaders,
      rows: finalRows,
      delimiter,
      totalRows: finalRows.length,
    },
  };
}

/**
 * Extract sample rows for AI analysis.
 * Takes the first N non-empty rows.
 */
export function extractSampleRows(rows: string[][], count = 20): string[][] {
  return rows.slice(0, count);
}
