/**
 * CSV/TSV parser for inventory import.
 *
 * Reuses the stripBom + parseCsvLine pattern from the COA import
 * (packages/modules/accounting/src/services/csv-import.ts).
 * Copied here because catalog module cannot import from accounting.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
  delimiter: string;
  totalRows: number;
}

export interface CsvParseError {
  message: string;
}

// ── Constants ────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 10_000;

// ── BOM + Line Utilities ─────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

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

// ── Delimiter Detection ──────────────────────────────────────────────

function detectDelimiter(headerLine: string): string {
  // Count occurrences of each candidate delimiter in the header
  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestCount = 0;

  for (const d of candidates) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }

  return best;
}

// ── Main Parser ──────────────────────────────────────────────────────

export function parseCsv(csvContent: string): CsvParseResult | CsvParseError {
  // Size guard
  if (csvContent.length > MAX_FILE_SIZE) {
    return { message: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` };
  }

  // Strip BOM and split into lines
  const raw = stripBom(csvContent).trim();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { message: 'File must contain a header row and at least one data row' };
  }

  if (lines.length - 1 > MAX_ROWS) {
    return { message: `File has ${lines.length - 1} rows (max ${MAX_ROWS.toLocaleString()})` };
  }

  // Detect delimiter from header row
  const delimiter = detectDelimiter(lines[0]!);

  // Parse header
  const headers = parseCsvLine(lines[0]!, delimiter).map((h) => h.replace(/^"|"$/g, ''));

  if (headers.length < 2) {
    return { message: 'File must contain at least 2 columns' };
  }

  // Parse data rows
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!, delimiter);
    // Skip completely empty rows
    if (values.every((v) => v === '')) continue;
    rows.push(values);
  }

  if (rows.length === 0) {
    return { message: 'No data rows found after header' };
  }

  return {
    headers,
    rows,
    delimiter,
    totalRows: rows.length,
  };
}

// Type guard
export function isParseError(result: CsvParseResult | CsvParseError): result is CsvParseError {
  return 'message' in result && !('headers' in result);
}
