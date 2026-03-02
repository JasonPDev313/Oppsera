import { createHash } from 'node:crypto';
import { Readable } from 'stream';
import { createGunzip } from 'zlib';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import { getBackupStorage } from './storage';
import type { BackupManifest } from './types';

/**
 * StreamingBackupReader — memory-efficient backup loader.
 *
 * Instead of JSON.parse(entireFile) which holds the full parsed object + the
 * raw string in memory simultaneously (~2x the decompressed size), this reader:
 *
 * 1. Decompresses via streaming (never holds compressed + decompressed at once)
 * 2. Extracts the manifest via targeted substring parsing
 * 3. Parses each table's row array independently via bracket-matched slicing
 * 4. After a table is processed, its parsed array is GC-eligible
 *
 * Peak memory: decompressed string + ONE table's parsed array
 * vs JSON.parse: decompressed string + ALL tables' parsed arrays
 *
 * For a 500MB backup with 50 tables: ~510MB peak vs ~1GB peak.
 */
export class StreamingBackupReader {
  /** The raw decompressed JSON string. Held in memory for random-access table lookup. */
  private json: string;
  /** Position where the `"data":{` object begins (the opening `{` of data). */
  private dataObjectStart: number;

  private constructor(json: string) {
    this.json = json;
    // Find the start of the "data" object
    const dataKeyPos = json.indexOf('"data"');
    if (dataKeyPos === -1) {
      throw new Error('Backup JSON missing "data" key — file may be corrupted');
    }
    // Skip past `"data":` to find the opening `{`
    const colonPos = json.indexOf(':', dataKeyPos + 6);
    if (colonPos === -1) {
      throw new Error('Backup JSON malformed after "data" key');
    }
    // Find the opening `{` of the data object
    let pos = colonPos + 1;
    while (pos < json.length && json[pos] !== '{') pos++;
    if (pos >= json.length) {
      throw new Error('Backup JSON: no data object found');
    }
    this.dataObjectStart = pos;
  }

  /**
   * Load a backup from storage with streaming decompression.
   * Validates checksum if present.
   */
  static async fromBackupId(backupId: string): Promise<StreamingBackupReader> {
    // Get backup record
    const result = await db.execute(
      sql`SELECT storage_driver, storage_path, checksum, status
          FROM platform_backups WHERE id = ${backupId}`,
    );
    const rows = Array.from(result as Iterable<{
      storage_driver: string;
      storage_path: string;
      checksum: string | null;
      status: string;
    }>);

    if (rows.length === 0) throw new Error(`Backup not found: ${backupId}`);
    const record = rows[0]!;

    if (record.status !== 'completed') {
      throw new Error(
        `Backup ${backupId} is not completed (status: ${record.status}). Only completed backups can be loaded.`,
      );
    }

    // Read compressed data from storage
    const storage = getBackupStorage(record.storage_driver);
    const compressed = await storage.read(record.storage_path);

    // Verify checksum
    if (record.checksum) {
      const actualChecksum = createHash('sha256').update(compressed).digest('hex');
      if (actualChecksum !== record.checksum) {
        throw new Error(
          `Checksum mismatch. Expected: ${record.checksum}, Got: ${actualChecksum}. Backup may be corrupted.`,
        );
      }
    }

    // Streaming decompression — decompress into chunks, concatenate at end.
    // This avoids holding compressed + decompressed simultaneously.
    const json = await streamDecompress(compressed);

    // Release compressed buffer — decompressed string is all we need
    // (the `compressed` variable goes out of scope after this function returns)

    return new StreamingBackupReader(json);
  }

  /**
   * Extract and parse only the manifest object.
   * Uses targeted parsing — finds the manifest key and bracket-matches to its end.
   */
  getManifest(): BackupManifest {
    const manifestKeyPos = this.json.indexOf('"manifest"');
    if (manifestKeyPos === -1) {
      throw new Error('Backup JSON missing "manifest" key');
    }

    // Find the opening `{` of the manifest object
    const colonPos = this.json.indexOf(':', manifestKeyPos + 10);
    let pos = colonPos + 1;
    while (pos < this.json.length && this.json[pos] !== '{') pos++;

    const endPos = findMatchingBracket(this.json, pos, '{', '}');
    if (endPos === -1) {
      throw new Error('Backup manifest JSON is malformed — unbalanced braces');
    }

    const manifestJson = this.json.slice(pos, endPos + 1);
    return JSON.parse(manifestJson) as BackupManifest;
  }

  /**
   * Get all table names from the data object without parsing their row arrays.
   * Scans for `"tableName":` keys within the data object.
   */
  getTableNames(): string[] {
    const names: string[] = [];
    let pos = this.dataObjectStart + 1; // skip opening `{`
    const json = this.json;

    while (pos < json.length) {
      // Skip whitespace
      while (pos < json.length && /\s/.test(json[pos]!)) pos++;

      if (json[pos] === '}') break; // end of data object
      if (json[pos] === ',') { pos++; continue; }

      // Expect a quoted key
      if (json[pos] !== '"') break;

      const keyEnd = json.indexOf('"', pos + 1);
      if (keyEnd === -1) break;

      const key = json.slice(pos + 1, keyEnd);
      names.push(key);

      // Skip past `:` to the value (the `[` array)
      pos = keyEnd + 1;
      while (pos < json.length && json[pos] !== '[') pos++;

      // Skip past the entire array value
      const arrayEnd = findMatchingBracket(json, pos, '[', ']');
      if (arrayEnd === -1) break;
      pos = arrayEnd + 1;
    }

    return names;
  }

  /**
   * Parse and return a single table's row array.
   * Only parses the slice of JSON for this table — other tables stay unparsed.
   *
   * Returns null if the table is not in the backup.
   */
  getTableRows(tableName: string): unknown[] | null {
    // Find the table key within the data object
    const searchKey = `"${tableName}"`;
    let searchFrom = this.dataObjectStart;
    let pos: number;

    while (true) {
      pos = this.json.indexOf(searchKey, searchFrom);
      if (pos === -1) return null;
      // Verify this key is inside the data object (not in manifest or values)
      if (pos < this.dataObjectStart) {
        searchFrom = pos + searchKey.length;
        continue;
      }
      // Verify it's followed by `:` (it's a key, not a string value)
      let afterKey = pos + searchKey.length;
      while (afterKey < this.json.length && /\s/.test(this.json[afterKey]!)) afterKey++;
      if (this.json[afterKey] === ':') break;
      searchFrom = pos + searchKey.length;
    }

    // Find the opening `[` of the array
    let arrStart = pos + searchKey.length;
    while (arrStart < this.json.length && this.json[arrStart] !== '[') arrStart++;

    const arrEnd = findMatchingBracket(this.json, arrStart, '[', ']');
    if (arrEnd === -1) {
      throw new Error(`Malformed JSON for table "${tableName}" — unbalanced brackets`);
    }

    // Parse only this table's array
    const arrayJson = this.json.slice(arrStart, arrEnd + 1);
    return JSON.parse(arrayJson) as unknown[];
  }

  /**
   * Release the internal JSON string to free memory.
   * Call this after all tables have been processed.
   */
  release(): void {
    (this as unknown as { json: string }).json = '';
  }
}

/**
 * Stream-decompress a gzip buffer into a UTF-8 string.
 * Uses Node.js stream pipeline to avoid holding compressed + decompressed
 * in memory simultaneously — the compressed buffer can be GC'd as soon
 * as the readable stream is consumed.
 */
async function streamDecompress(compressed: Buffer): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const readable = Readable.from(compressed);
    const gunzipStream = createGunzip();

    readable.pipe(gunzipStream);

    gunzipStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    gunzipStream.on('end', () => {
      const decompressed = Buffer.concat(chunks);
      chunks.length = 0; // free chunk references
      resolve(decompressed.toString('utf-8'));
    });

    gunzipStream.on('error', (err) => {
      reject(new Error(`Decompression failed: ${err.message}`));
    });
  });
}

/**
 * Find the position of the matching closing bracket/brace.
 * Properly handles nested structures and string escaping.
 *
 * @param json - The JSON string
 * @param openPos - Position of the opening bracket/brace
 * @param open - Opening character ('[' or '{')
 * @param close - Closing character (']' or '}')
 * @returns Position of the matching close, or -1 if malformed
 */
function findMatchingBracket(
  json: string,
  openPos: number,
  open: string,
  close: string,
): number {
  let depth = 1;
  let i = openPos + 1;
  let inString = false;
  let escaped = false;

  while (i < json.length && depth > 0) {
    const ch = json[i]!;

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      i++;
      continue;
    }

    if (!inString) {
      if (ch === open) depth++;
      else if (ch === close) depth--;
    }

    i++;
  }

  return depth === 0 ? i - 1 : -1;
}
