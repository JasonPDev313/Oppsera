/**
 * CSV parser for staff import.
 * Handles BOM, quoted fields, flexible delimiters.
 * Returns parsed headers + rows.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 5_000;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

/**
 * Known row-type prefixes used by legacy golf/club management systems.
 * When the first column header matches one of these and data rows have a
 * consistent prefix value (e.g., "CU" for course users), we strip the
 * prefix column since it's a record-type marker, not real data.
 */
const ROW_TYPE_HEADER_MARKERS = new Set(['hdr', 'rec', 'record_type', 'recordtype', 'row_type', 'rowtype', 'type']);

function detectRowTypePrefix(headers: string[], firstFewRows: string[][]): boolean {
  if (headers.length < 2) return false;
  const firstHeader = headers[0]!.toLowerCase().trim();
  if (!ROW_TYPE_HEADER_MARKERS.has(firstHeader)) return false;

  // Verify data rows all have a short constant prefix (2-4 uppercase chars)
  if (firstFewRows.length === 0) return false;
  const prefixRe = /^[A-Z]{1,6}$/;
  const firstVal = firstFewRows[0]?.[0]?.trim() ?? '';
  if (!prefixRe.test(firstVal)) return false;

  // Check that at least 80% of rows share the same prefix
  const matchCount = firstFewRows.filter((r) => (r[0]?.trim() ?? '') === firstVal).length;
  return matchCount / firstFewRows.length >= 0.8;
}

export function parseStaffCsv(raw: string): ParsedCsv {
  if (raw.length > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  // Strip BOM
  let text = raw;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Detect delimiter
  const delimiter = detectDelimiter(text);

  const lines = splitLines(text);
  if (lines.length < 2) {
    throw new Error('File must have at least a header row and one data row');
  }

  let headers = parseLine(lines[0]!, delimiter).map((h) => h.trim());
  const rows: string[][] = [];

  for (let i = 1; i < lines.length && rows.length < MAX_ROWS; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cells = parseLine(line, delimiter);
    // Pad to header length
    while (cells.length < headers.length) cells.push('');
    rows.push(cells);
  }

  if (rows.length === 0) {
    throw new Error('No data rows found after header');
  }

  // Detect and strip row-type prefix column (e.g., HDR/CU from Club Caddie exports)
  if (detectRowTypePrefix(headers, rows.slice(0, 10))) {
    headers = headers.slice(1);
    for (let i = 0; i < rows.length; i++) {
      rows[i] = rows[i]!.slice(1);
    }
  }

  return { headers, rows, delimiter };
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const pipeCount = (firstLine.match(/\|/g) ?? []).length;

  const max = Math.max(tabCount, commaCount, semiCount, pipeCount);
  if (max === 0) return ',';
  if (tabCount === max) return '\t';
  if (semiCount === max) return ';';
  if (pipeCount === max) return '|';
  return ',';
}

function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      lines.push(current);
      current = '';
      // Skip \r\n pair
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

function parseLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
