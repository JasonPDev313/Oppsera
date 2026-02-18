/**
 * Data Cleaning & Conflict Resolution
 *
 * Applies automated cleaning rules to legacy data before transformation.
 * Rows that can't be cleaned are quarantined for manual review.
 *
 * Pipeline order per row:
 *   1. Skip soft-deleted rows (IsDeleted = 1)
 *   2. Deduplicate by composite key (tenantId:legacyId)
 *   3. Trim whitespace, normalize NULLs across all string fields
 *   4. Validate required columns
 *   5. Validate tenant ID exists
 *   6. Accept or quarantine
 *
 * Type-specific cleaners (moneyToCents, bitToBool, etc.) are applied
 * individually by domain transformers after the batch cleaning pass.
 */
import type { QuarantineRecord } from './types';

export interface CleanResult {
  cleaned: Record<string, unknown>[];
  quarantined: QuarantineRecord[];
}

export interface CleanOptions {
  /** Column containing the primary key (default: 'Id') */
  idColumn?: string;
  /** Column containing the tenant identifier (default: 'ClubId') */
  tenantIdColumn?: string;
  /** Column containing the soft-delete flag (default: 'IsDeleted') */
  deletedColumn?: string;
  /** Columns that must be non-null for the row to be valid */
  requiredColumns?: string[];
}

/**
 * Canonical set of strings that represent NULL in legacy MSSQL exports.
 * MSSQL bcp and SSMS export produce various representations depending
 * on column type and client encoding.
 */
const NULL_VALUES = new Set(['NULL', 'null', 'None', 'N/A', 'n/a', 'undefined', '']);

/**
 * Main cleaning pipeline.
 *
 * Processes a batch of raw rows from the loader and separates them into
 * cleaned rows ready for transformation and quarantined rows that need
 * manual review.
 *
 * @param rows - Raw rows from the loader (one batch)
 * @param sourceTable - Legacy table name (e.g. "GF_Customer")
 * @param targetTable - Target Postgres table name (e.g. "customers")
 * @param domain - Migration domain (e.g. "customers")
 * @param options - Cleaning options
 */
export function cleanBatch(
  rows: Record<string, unknown>[],
  sourceTable: string,
  targetTable: string,
  domain: string,
  options: CleanOptions = {},
): CleanResult {
  const cleaned: Record<string, unknown>[] = [];
  const quarantined: QuarantineRecord[] = [];
  const seenIds = new Set<string>();

  const idCol = options.idColumn ?? 'Id';
  const tenantIdCol = options.tenantIdColumn ?? 'ClubId';
  const deletedCol = options.deletedColumn ?? 'IsDeleted';

  for (const raw of rows) {
    // Work on a shallow copy so we don't mutate the original
    const row = { ...raw };
    const legacyId = row[idCol] ?? row['ID'] ?? row['id'];
    const tenantId = String(row[tenantIdCol] ?? row['CourseId'] ?? '');

    // 1. Skip soft-deleted rows
    if (isTrue(row[deletedCol])) continue;

    // 2. Deduplicate by composite key (tenantId:legacyId) within this batch
    const idKey = `${tenantId}:${legacyId}`;
    if (seenIds.has(idKey)) {
      quarantined.push({
        domain,
        sourceTable,
        targetTable,
        legacyId: legacyId as string | number,
        tenantId,
        reason: 'Duplicate row (same ID within tenant)',
        rawData: raw,
        timestamp: new Date(),
      });
      continue;
    }
    seenIds.add(idKey);

    // 3. Clean all string fields: trim whitespace, normalize NULL representations
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        row[key] = NULL_VALUES.has(trimmed) ? null : trimmed;
      }
    }

    // 4. Validate required columns
    let quarantineReason: string | null = null;
    if (options.requiredColumns) {
      for (const col of options.requiredColumns) {
        if (row[col] == null || row[col] === '') {
          quarantineReason = `Missing required column: ${col}`;
          break;
        }
      }
    }

    // 5. Validate tenant/club ID exists
    if (!quarantineReason && (!tenantId || tenantId === 'null' || tenantId === 'undefined')) {
      quarantineReason = 'Missing tenant/club ID';
    }

    if (quarantineReason) {
      quarantined.push({
        domain,
        sourceTable,
        targetTable,
        legacyId: legacyId as string | number,
        tenantId,
        reason: quarantineReason,
        rawData: raw,
        timestamp: new Date(),
      });
      continue;
    }

    cleaned.push(row);
  }

  return { cleaned, quarantined };
}

// ---------------------------------------------------------------------------
// Type-specific cleaners
//
// These are applied individually by domain transformers via ColumnTransform
// definitions. They handle the legacy → OppsEra type conversions:
//   - Money: decimal dollars (MSSQL) → integer cents (Postgres)
//   - Boolean: bit 0/1 (MSSQL) → boolean (Postgres)
//   - Timestamp: datetime (MSSQL, often local TZ) → timestamptz UTC (Postgres)
// ---------------------------------------------------------------------------

/**
 * Convert legacy money value (dollars with optional $, commas) to integer cents.
 *
 * Examples:
 *   moneyToCents('$1,234.56') → 123456
 *   moneyToCents('19.99')     → 1999
 *   moneyToCents(0)           → 0
 *   moneyToCents(null)        → null
 *   moneyToCents('NULL')      → null
 */
export function moneyToCents(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).replace(/[$,\s]/g, '');
  if (str === '' || str === 'null' || str === 'NULL') return null;
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

/**
 * Convert legacy bit/boolean to boolean.
 *
 * Handles MSSQL bit (0/1), string representations, and actual booleans.
 */
export function bitToBool(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  const str = String(value).trim().toLowerCase();
  return str === '1' || str === 'true' || str === 'yes';
}

/**
 * Convert legacy datetime string to ISO 8601 timestamptz string.
 *
 * Clamps future dates to now (common data quality issue in legacy systems
 * where test data or clock skew produced dates in the future).
 *
 * Returns null for unparseable or empty values.
 */
export function datetimeToTimestamptz(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || NULL_VALUES.has(str)) return null;

  const date = new Date(str);
  if (isNaN(date.getTime())) return null;

  // Clamp future dates to now (data quality issue)
  const now = new Date();
  if (date > now) {
    return now.toISOString();
  }

  return date.toISOString();
}

/**
 * Convert legacy date to YYYY-MM-DD format.
 *
 * Unlike datetimeToTimestamptz, this does NOT clamp future dates
 * (used for expiration dates, scheduled dates, etc.).
 */
export function dateToDate(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || NULL_VALUES.has(str)) return null;

  const date = new Date(str);
  if (isNaN(date.getTime())) return null;

  return date.toISOString().split('T')[0]!;
}

/**
 * Normalize email addresses.
 *
 * Lowercases, trims, and validates basic email format.
 * Returns null for invalid emails (quarantine-worthy data is handled
 * by the caller, not here).
 */
export function cleanEmail(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim().toLowerCase();
  if (str === '' || NULL_VALUES.has(str)) return null;

  // Basic email validation: something@something.something
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(str)) return null;

  return str;
}

/**
 * Normalize phone numbers to E.164-ish format.
 *
 * Strips all non-digit characters, then:
 *   - 10 digits → +1XXXXXXXXXX (US assumed)
 *   - 11 digits starting with 1 → +1XXXXXXXXXX
 *   - Other lengths → +{digits} (best effort)
 *   - < 7 digits → null (too short to be valid)
 */
export function cleanPhone(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || NULL_VALUES.has(str)) return null;

  // Strip all non-digit characters
  const digits = str.replace(/\D/g, '');
  if (digits.length < 7) return null;

  // Normalize to E.164-ish format
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  return digits.length > 0 ? `+${digits}` : null;
}

/**
 * Clean and normalize a string to a status enum value.
 *
 * Lowercases, replaces spaces with underscores, then checks against
 * the list of valid values. Returns defaultValue if not found.
 *
 * Example:
 *   cleanStatus('Active', ['active', 'inactive', 'suspended'], 'active') → 'active'
 *   cleanStatus('In Progress', ['pending', 'in_progress', 'done'], 'pending') → 'in_progress'
 *   cleanStatus('GARBAGE', ['active', 'inactive'], 'active') → 'active'
 */
export function cleanStatus(value: unknown, validValues: string[], defaultValue: string): string {
  if (value == null) return defaultValue;
  const str = String(value).trim().toLowerCase().replace(/\s+/g, '_');
  return validValues.includes(str) ? str : defaultValue;
}

/**
 * Truncate a string to a maximum length.
 *
 * Used to enforce VARCHAR(n) limits when legacy ntext/nvarchar(max)
 * columns contained arbitrarily long data.
 */
export function truncate(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || NULL_VALUES.has(str)) return null;
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}

/**
 * Strip HTML tags from legacy ntext/nvarchar fields.
 *
 * Legacy MSSQL systems often stored rich text as HTML in ntext columns.
 * This strips tags and decodes common HTML entities for plain text storage.
 */
export function stripHtml(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || NULL_VALUES.has(str)) return null;

  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean a numeric string, returning a number or null.
 *
 * Strips commas and whitespace, validates as finite number.
 * Does NOT convert dollars to cents (use moneyToCents for that).
 */
export function cleanNumber(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).replace(/[,\s]/g, '');
  if (str === '' || NULL_VALUES.has(str)) return null;
  const num = Number(str);
  return isFinite(num) ? num : null;
}

/**
 * Clean an integer value (legacy IDs, counts, etc.).
 *
 * Parses as integer, returns null for non-integer values.
 */
export function cleanInt(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '' || NULL_VALUES.has(str)) return null;
  const num = parseInt(str, 10);
  return isNaN(num) ? null : num;
}

/**
 * Clean a percentage value from legacy data.
 *
 * Legacy systems may store as 0.10 (ratio), 10 (percent), or "10%".
 * This normalizes to the raw percentage number (10 for 10%).
 *
 * Per CLAUDE.md gotcha #37: store as raw percentage, not basis points.
 */
export function cleanPercentage(value: unknown): number | null {
  if (value == null) return null;
  const str = String(value).replace(/%/g, '').trim();
  if (str === '' || NULL_VALUES.has(str)) return null;
  const num = parseFloat(str);
  if (isNaN(num)) return null;

  // If the value looks like a ratio (0 < x < 1 and not exactly 0 or 1),
  // convert to percentage. Legacy systems sometimes store 0.10 for 10%.
  if (num > 0 && num < 1) {
    return Math.round(num * 10000) / 100; // e.g. 0.105 → 10.5
  }

  return num;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check if a value is truthy (handles legacy MSSQL bit fields) */
function isTrue(value: unknown): boolean {
  if (value == null) return false;
  const str = String(value).trim().toLowerCase();
  return str === '1' || str === 'true' || str === 'yes';
}
