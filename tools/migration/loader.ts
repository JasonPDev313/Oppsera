/**
 * CSV/JSON Export File Loader
 *
 * Reads legacy data exports and yields row batches for processing.
 * Supports both CSV and JSON formats with streaming to handle large files.
 *
 * File naming convention: GF_TableName.csv or GF_TableName.json
 * Handles encoding issues common with MSSQL exports (UTF-8, UTF-16LE, BOM).
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

export interface LoaderOptions {
  batchSize: number;
  encoding?: BufferEncoding;
}

export interface ExportFileInfo {
  tableName: string;
  filePath: string;
  format: 'csv' | 'json';
  sizeBytes: number;
}

export interface LoadProgress {
  tableName: string;
  format: 'csv' | 'json';
  batchesYielded: number;
  rowsYielded: number;
}

/** Discover all export files in a directory */
export function discoverExportFiles(exportDir: string): ExportFileInfo[] {
  const files: ExportFileInfo[] = [];

  if (!fs.existsSync(exportDir)) {
    throw new Error(`Export directory does not exist: ${exportDir}`);
  }

  for (const entry of fs.readdirSync(exportDir)) {
    const fullPath = path.join(exportDir, entry);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    const ext = path.extname(entry).toLowerCase();
    if (ext !== '.csv' && ext !== '.json') continue;

    const tableName = path.basename(entry, ext);
    files.push({
      tableName,
      filePath: fullPath,
      format: ext === '.csv' ? 'csv' : 'json',
      sizeBytes: stat.size,
    });
  }

  return files.sort((a, b) => a.tableName.localeCompare(b.tableName));
}

/**
 * Detect file encoding by inspecting the BOM (Byte Order Mark).
 *
 * MSSQL exports sometimes produce UTF-16LE files. We check the first
 * two bytes: FF FE = UTF-16LE, EF BB BF = UTF-8 with BOM, otherwise
 * assume UTF-8.
 */
export function detectEncoding(filePath: string): BufferEncoding {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(3);
  fs.readSync(fd, buf, 0, 3, 0);
  fs.closeSync(fd);

  // UTF-16LE BOM: FF FE
  if (buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
  // UTF-8 BOM: EF BB BF (still utf-8, just has BOM we'll strip later)
  return 'utf-8';
}

/** Parse a CSV line respecting quoted fields and embedded commas */
function parseCSVLine(line: string, headers: string[]): Record<string, string> {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote (doubled)
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]!] = values[i] ?? '';
  }
  return row;
}

/**
 * Strip BOM characters from a string.
 * Handles UTF-8 BOM (\uFEFF) and any stray null bytes from UTF-16 conversions.
 */
function stripBOM(str: string): string {
  return str.replace(/^\uFEFF/, '').replace(/\0/g, '');
}

/**
 * Stream rows from a CSV file in batches.
 *
 * Uses readline for line-by-line streaming so even multi-GB files
 * only consume memory proportional to batchSize.
 */
export async function* loadCSV(
  filePath: string,
  options: LoaderOptions,
): AsyncGenerator<Record<string, string>[]> {
  const encoding = options.encoding ?? detectEncoding(filePath);
  const stream = fs.createReadStream(filePath, { encoding });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] = [];
  let batch: Record<string, string>[] = [];
  let lineNum = 0;
  let totalYielded = 0;

  for await (const rawLine of rl) {
    lineNum++;

    // Strip BOM from first line (common in MSSQL exports)
    const line = lineNum === 1 ? stripBOM(rawLine) : rawLine;

    // First line is always the header row
    if (lineNum === 1) {
      headers = line.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
      continue;
    }

    // Skip empty lines
    if (line.trim() === '') continue;

    try {
      const row = parseCSVLine(line, headers);
      batch.push(row);

      if (batch.length >= options.batchSize) {
        totalYielded += batch.length;
        yield batch;
        batch = [];
      }
    } catch {
      console.warn(`[loader] Skipping malformed CSV line ${lineNum} in ${filePath}`);
    }
  }

  // Yield the final partial batch
  if (batch.length > 0) {
    totalYielded += batch.length;
    yield batch;
  }

  console.log(
    `[loader] CSV ${path.basename(filePath)}: ${totalYielded} rows in ${Math.ceil(totalYielded / options.batchSize)} batches`,
  );
}

/**
 * Stream rows from a JSON file in batches.
 *
 * Supports two common export shapes:
 *   - Array of objects: [{ ... }, { ... }]
 *   - Wrapper object:   { rows: [...] } or { data: [...] }
 *
 * Note: JSON files are loaded into memory. For very large JSON exports,
 * convert to CSV first (MSSQL bcp utility or SSMS export).
 */
export async function* loadJSON(
  filePath: string,
  options: LoaderOptions,
): AsyncGenerator<Record<string, unknown>[]> {
  const encoding = options.encoding ?? detectEncoding(filePath);
  const content = fs.readFileSync(filePath, encoding);
  const clean = stripBOM(content);

  let data: Record<string, unknown>[];

  try {
    const parsed = JSON.parse(clean);
    // Support both array format and { rows: [...] } / { data: [...] } format
    if (Array.isArray(parsed)) {
      data = parsed;
    } else if (parsed && typeof parsed === 'object') {
      data = parsed.rows ?? parsed.data ?? [];
    } else {
      throw new Error('Unexpected JSON structure: expected array or object with rows/data');
    }
  } catch (e) {
    throw new Error(`Failed to parse JSON file ${filePath}: ${e}`);
  }

  let totalYielded = 0;

  for (let i = 0; i < data.length; i += options.batchSize) {
    const batch = data.slice(i, i + options.batchSize);
    totalYielded += batch.length;
    yield batch;
  }

  console.log(
    `[loader] JSON ${path.basename(filePath)}: ${totalYielded} rows in ${Math.ceil(totalYielded / options.batchSize)} batches`,
  );
}

/**
 * Load a legacy table by name, auto-detecting format.
 *
 * Tries CSV first (preferred for large files due to streaming), then JSON.
 * The tableName should match the file stem, e.g. "GF_Customer" will look
 * for GF_Customer.csv or GF_Customer.json in the export directory.
 */
export async function* loadTable(
  tableName: string,
  exportDir: string,
  options: LoaderOptions = { batchSize: 500 },
): AsyncGenerator<Record<string, unknown>[]> {
  const csvPath = path.join(exportDir, `${tableName}.csv`);
  const jsonPath = path.join(exportDir, `${tableName}.json`);

  if (fs.existsSync(csvPath)) {
    yield* loadCSV(csvPath, options);
  } else if (fs.existsSync(jsonPath)) {
    yield* loadJSON(jsonPath, options);
  } else {
    console.warn(
      `[loader] No export file found for table "${tableName}" (tried ${csvPath} and ${jsonPath})`,
    );
  }
}

/**
 * Count total rows in an export file (for progress tracking).
 *
 * For CSV: counts non-empty lines minus the header.
 * For JSON: parses and counts array length.
 */
export async function countRows(filePath: string): Promise<number> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    const content = stripBOM(fs.readFileSync(filePath, 'utf-8'));
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') {
      const data = parsed.rows ?? parsed.data ?? [];
      return Array.isArray(data) ? data.length : 0;
    }
    return 0;
  }

  // CSV: count non-empty lines minus the header row
  let count = -1; // start at -1 to exclude header
  const encoding = detectEncoding(filePath);
  const stream = fs.createReadStream(filePath, { encoding });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim() !== '') count++;
  }

  return Math.max(0, count);
}

/**
 * Get a summary of all discovered export files with row counts.
 *
 * Useful for pre-migration reporting:
 *   const files = discoverExportFiles(dir);
 *   const summary = await getExportSummary(files);
 *   summary.forEach(f => console.log(`${f.tableName}: ${f.rowCount} rows (${f.format})`));
 */
export async function getExportSummary(
  files: ExportFileInfo[],
): Promise<(ExportFileInfo & { rowCount: number })[]> {
  const results: (ExportFileInfo & { rowCount: number })[] = [];

  for (const file of files) {
    const rowCount = await countRows(file.filePath);
    results.push({ ...file, rowCount });
  }

  return results;
}
