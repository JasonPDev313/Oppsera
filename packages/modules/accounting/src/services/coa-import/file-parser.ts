/**
 * Multi-format file parser for COA import.
 *
 * Supports CSV, TSV. Excel support requires `xlsx` package (optional dependency).
 * Handles BOM, quoted values, escaped quotes, various line endings.
 */

import type { FileFormat, ParsedFile } from './types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 25_000;
const SAMPLE_SIZE = 10;

// ── Public API ──────────────────────────────────────────────────────

export function parseFile(
  content: string,
  format: FileFormat = 'csv',
  fileName?: string,
): ParsedFile {
  // Auto-detect format from fileName if not explicit
  if (fileName && format === 'csv') {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'tsv' || ext === 'tab') format = 'tsv';
    else if (ext === 'xlsx' || ext === 'xls') format = 'xlsx';
  }

  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
  }

  if (format === 'xlsx') {
    throw new Error('Excel (.xlsx) format requires the xlsx package. Please convert to CSV or TSV.');
  }

  const delimiter = format === 'tsv' ? '\t' : ',';
  return parseDelimited(content, delimiter, format);
}

/**
 * Detect file format from content heuristics.
 */
export function detectFormat(content: string, fileName?: string): FileFormat {
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'tsv' || ext === 'tab') return 'tsv';
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
    if (ext === 'csv') return 'csv';
  }

  // Heuristic: count tabs vs commas in first 5 lines
  const firstLines = content.split(/\r?\n/).slice(0, 5).join('\n');
  const tabCount = (firstLines.match(/\t/g) || []).length;
  const commaCount = (firstLines.match(/,/g) || []).length;

  if (tabCount > commaCount * 2) return 'tsv';
  return 'csv';
}

// ── Internal Parsers ────────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
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

function parseDelimited(content: string, delimiter: string, format: FileFormat): ParsedFile {
  const raw = stripBom(content).trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    throw new Error('File must contain a header row and at least one data row');
  }

  if (lines.length - 1 > MAX_ROWS) {
    throw new Error(`File has ${lines.length - 1} data rows (max ${MAX_ROWS.toLocaleString()})`);
  }

  const headers = parseDelimitedLine(lines[0]!, delimiter)
    .map((h) => h.replace(/^["']|["']$/g, ''));

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const parsed = parseDelimitedLine(lines[i]!, delimiter)
      .map((v) => v.replace(/^["']|["']$/g, ''));
    // Skip completely empty rows
    if (parsed.every((v) => v === '')) continue;
    rows.push(parsed);
  }

  const sampleRows = rows.slice(0, SAMPLE_SIZE);

  return {
    headers,
    rows,
    totalRows: rows.length,
    format,
    sampleRows,
  };
}
