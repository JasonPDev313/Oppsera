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

  return {
    data: {
      headers,
      rows,
      delimiter,
      totalRows: rows.length,
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
