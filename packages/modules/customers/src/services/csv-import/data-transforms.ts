/**
 * Data transformations for legacy CSV data.
 *
 * Handles:
 *  - Full Name → firstName + lastName (with prefix/suffix detection)
 *  - "City, ST ZIP" → city + state + postalCode
 *  - Type coercion (booleans, dates, gender, status, currency)
 *  - Tags from delimited strings
 *  - Entity type detection (person vs organization)
 */

// ── Name Splitting ──────────────────────────────────────────────────

const PREFIXES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'sir', 'madam',
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'rev.',
]);

const SUFFIXES = new Set([
  'jr', 'sr', 'jr.', 'sr.', 'ii', 'iii', 'iv', 'v',
  'esq', 'esq.', 'phd', 'ph.d.', 'md', 'm.d.', 'dds', 'dvm',
]);

export interface SplitNameResult {
  prefix?: string;
  firstName: string;
  lastName: string;
  suffix?: string;
}

export function splitFullName(fullName: string): SplitNameResult {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: '', lastName: '' };

  const parts = trimmed.split(/\s+/);

  let prefix: string | undefined;
  let suffix: string | undefined;

  // Check for prefix
  if (parts.length > 2 && PREFIXES.has(parts[0]!.toLowerCase())) {
    prefix = parts.shift()!;
  }

  // Check for suffix
  if (parts.length > 2 && SUFFIXES.has(parts[parts.length - 1]!.toLowerCase())) {
    suffix = parts.pop()!;
  }

  if (parts.length === 0) {
    return { prefix, firstName: '', lastName: '', suffix };
  }

  if (parts.length === 1) {
    return { prefix, firstName: parts[0]!, lastName: '', suffix };
  }

  // Last part is last name, everything else is first name
  const lastName = parts.pop()!;
  const firstName = parts.join(' ');

  return { prefix, firstName, lastName, suffix };
}

// ── Address Splitting ───────────────────────────────────────────────

export interface SplitAddressResult {
  city: string;
  state: string;
  postalCode: string;
}

/**
 * Parse "City, ST 12345" or "City, ST" or "City, State" patterns.
 */
export function splitCityStateZip(combined: string): SplitAddressResult {
  const trimmed = combined.trim();
  if (!trimmed) return { city: '', state: '', postalCode: '' };

  // Pattern: "City, ST 12345" or "City, ST 12345-6789"
  const full = trimmed.match(/^(.+?),\s*([A-Za-z]{2,})\s+(\d{5}(?:-\d{4})?)$/);
  if (full) {
    return { city: full[1]!.trim(), state: full[2]!.trim(), postalCode: full[3]!.trim() };
  }

  // Pattern: "City, ST" (no zip)
  const cityState = trimmed.match(/^(.+?),\s*([A-Za-z]{2,})$/);
  if (cityState) {
    return { city: cityState[1]!.trim(), state: cityState[2]!.trim(), postalCode: '' };
  }

  // Can't parse — return as city
  return { city: trimmed, state: '', postalCode: '' };
}

// ── Type Coercion ───────────────────────────────────────────────────

const TRUE_VALUES = new Set(['true', 'yes', 'y', '1', 'on', 'active', 'opt-in', 'opted in']);
const FALSE_VALUES = new Set(['false', 'no', 'n', '0', 'off', 'inactive', 'opt-out', 'opted out']);

export function coerceBoolean(value: string): boolean | null {
  const lower = value.trim().toLowerCase();
  if (TRUE_VALUES.has(lower)) return true;
  if (FALSE_VALUES.has(lower)) return false;
  return null;
}

/**
 * Parse date strings in common formats:
 *  MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, DD/MM/YYYY (if explicitly flagged),
 *  M/D/YYYY, YYYY/MM/DD, DD-Mon-YYYY
 *
 * Returns ISO date string (YYYY-MM-DD) or null.
 */
export function coerceDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00');
    if (!isNaN(d.getTime())) return trimmed;
  }

  // ISO with time: YYYY-MM-DDTHH:MM:SS...
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]!;
  }

  // US format: M/D/YYYY or MM/DD/YYYY
  const usSlash = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (usSlash) {
    const month = usSlash[1]!.padStart(2, '0');
    const day = usSlash[2]!.padStart(2, '0');
    const year = usSlash[3]!;
    const isoStr = `${year}-${month}-${day}`;
    const d = new Date(isoStr + 'T00:00:00');
    if (!isNaN(d.getTime())) return isoStr;
  }

  // 2-digit year: M/D/YY
  const shortYear = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})$/);
  if (shortYear) {
    const month = shortYear[1]!.padStart(2, '0');
    const day = shortYear[2]!.padStart(2, '0');
    const yr = parseInt(shortYear[3]!, 10);
    const year = yr >= 50 ? `19${shortYear[3]}` : `20${shortYear[3]}`;
    const isoStr = `${year}-${month}-${day}`;
    const d = new Date(isoStr + 'T00:00:00');
    if (!isNaN(d.getTime())) return isoStr;
  }

  return null;
}

// ── Gender Normalization ────────────────────────────────────────────

const GENDER_MAP: Record<string, string> = {
  m: 'male', male: 'male', man: 'male',
  f: 'female', female: 'female', woman: 'female',
  nb: 'non_binary', 'non-binary': 'non_binary', nonbinary: 'non_binary', non_binary: 'non_binary',
  other: 'other',
  prefer_not_to_say: 'prefer_not_to_say', 'prefer not to say': 'prefer_not_to_say',
  unknown: 'prefer_not_to_say',
};

export function coerceGender(value: string): string | null {
  const lower = value.trim().toLowerCase();
  return GENDER_MAP[lower] ?? null;
}

// ── Status Normalization ────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  active: 'active', a: 'active', current: 'active',
  inactive: 'inactive', i: 'inactive', disabled: 'inactive',
  prospect: 'prospect', p: 'prospect',
  lead: 'lead', l: 'lead',
  suspended: 'suspended', s: 'suspended', hold: 'suspended',
  banned: 'banned', blocked: 'banned',
  deceased: 'deceased', d: 'deceased',
  archived: 'archived', deleted: 'archived',
};

export function coerceStatus(value: string): string | null {
  const lower = value.trim().toLowerCase();
  return STATUS_MAP[lower] ?? null;
}

// ── Currency Parsing ────────────────────────────────────────────────

/**
 * Parse currency strings to cents (integer).
 * "$1,250.50" → 125050
 * "1250.50" → 125050
 * "-500" → -50000
 */
export function parseCurrencyToCents(value: string): number | null {
  const cleaned = value.trim().replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

// ── Tags Parsing ────────────────────────────────────────────────────

/**
 * Split tags from common delimited formats.
 * "VIP, Golf, Premium" → ["VIP", "Golf", "Premium"]
 * "VIP;Golf;Premium" → ["VIP", "Golf", "Premium"]
 * "VIP|Golf|Premium" → ["VIP", "Golf", "Premium"]
 */
export function parseTags(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// ── Phone Normalization ─────────────────────────────────────────────

/**
 * Normalize phone to digits-only with optional leading +.
 * "(555) 123-4567" → "5551234567"
 * "+1-555-123-4567" → "+15551234567"
 */
export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

// ── Entity Type Detection ───────────────────────────────────────────

/**
 * Detect if a row represents a person or organization.
 */
export function detectEntityType(
  firstName: string | undefined,
  lastName: string | undefined,
  orgName: string | undefined,
): 'person' | 'organization' {
  if (orgName && !firstName && !lastName) return 'organization';
  return 'person';
}
