/**
 * PII Data Masking for Semantic Pipeline
 *
 * Two-layer detection strategy:
 * 1. Column-name heuristics — known PII column patterns matched structurally
 * 2. Value-pattern detection — regex patterns applied to string values in
 *    columns not caught by layer 1
 *
 * Applied at the boundary between query results and LLM/storage consumers.
 * The frontend still receives unmasked data (within app boundary).
 */

// ── Column-Name Heuristics (Layer 1) ────────────────────────────────

/**
 * Column names that exactly match these strings are PII.
 * Compared case-insensitively after normalizing underscores.
 */
const PII_COLUMN_EXACT = new Set([
  'name',
  'email',
  'phone',
  'mobile',
  'fax',
  'address',
  'street',
  'city',
  'zip',
  'postal',
  'ssn',
  'password',
  'token',
]);

/**
 * Column names containing any of these substrings are PII.
 * Matched case-insensitively.
 */
const PII_COLUMN_SUBSTRINGS = [
  // Names
  'first_name',
  'last_name',
  'display_name',
  'full_name',
  'guest_name',
  'customer_name',
  'member_name',
  'staff_name',
  'employee_name',
  'housekeeper_name',
  'server_name',
  'user_name',
  'contact_name',
  'billing_name',
  'cardholder',
  'recipient',
  'firstname',
  'lastname',
  'displayname',
  'fullname',

  // Contact
  'email_address',
  'phone_number',
  'mobile_number',
  'fax_number',
  'home_phone',
  'work_phone',
  'cell_phone',
  'street_address',
  'postal_code',
  'zip_code',
  'address_line',

  // Identity
  'tax_id',
  'card_number',
  'wristband',
  'identifier_value',
  'password_hash',
  'social_security',
  'drivers_license',
  'passport_number',
  'national_id',
  'account_number',

  // JSONB fields that embed PII
  'primary_guest_json',
  'guest_json',
  'contact_json',
  'billing_json',
  'customer_json',
];

/**
 * Column name suffixes that indicate PII when combined with any prefix.
 * e.g., `guest_email`, `billing_phone`, `emergency_contact_name`
 */
const PII_COLUMN_SUFFIXES = [
  '_name',
  '_email',
  '_phone',
  '_mobile',
  '_address',
  '_ssn',
];

/**
 * Determines if a column name represents PII based on structural heuristics.
 */
export function isPiiColumn(columnName: string): boolean {
  const lower = columnName.toLowerCase();

  // Exact match
  if (PII_COLUMN_EXACT.has(lower)) return true;

  // Substring match
  for (const pattern of PII_COLUMN_SUBSTRINGS) {
    if (lower.includes(pattern)) return true;
  }

  // Suffix match
  for (const suffix of PII_COLUMN_SUFFIXES) {
    if (lower.endsWith(suffix)) return true;
  }

  return false;
}

// ── Value-Pattern Detection (Layer 2) ───────────────────────────────

/**
 * Regex patterns to detect PII in string values.
 * Applied to columns NOT already flagged by column-name heuristics.
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

interface DetectedPii {
  type: 'email' | 'phone' | 'ssn';
  pattern: RegExp;
  mask: (match: string) => string;
}

const VALUE_DETECTORS: DetectedPii[] = [
  {
    type: 'email',
    pattern: EMAIL_PATTERN,
    mask: maskEmail,
  },
  {
    type: 'phone',
    pattern: PHONE_PATTERN,
    mask: maskPhone,
  },
  {
    type: 'ssn',
    pattern: SSN_PATTERN,
    mask: () => '***-**-****',
  },
];

// ── Masking Functions ───────────────────────────────────────────────

/**
 * Mask an email address: keep first character + TLD.
 * `john.doe@example.com` → `j***@***.com`
 */
function maskEmail(email: string): string {
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return '[EMAIL]';

  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const dotIdx = domain.lastIndexOf('.');
  if (dotIdx < 0) return `${local[0] ?? '*'}***@***`;

  const tld = domain.slice(dotIdx); // includes the dot
  const firstChar = local[0] ?? '*';
  return `${firstChar}***@***${tld}`;
}

/**
 * Mask a phone number: keep last 4 digits.
 * `(555) 123-4567` → `(***) ***-4567`
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  const last4 = digits.slice(-4);
  return `(***) ***-${last4}`;
}

/**
 * Mask a person's name: reduce to initials.
 * `John Smith` → `J. S.`
 * `Jane` → `J.`
 */
function maskName(name: string): string {
  if (!name || typeof name !== 'string') return '[NAME]';
  const trimmed = name.trim();
  if (trimmed.length === 0) return '[NAME]';

  const parts = trimmed.split(/\s+/);
  return parts
    .map((p) => {
      const first = p[0];
      return first ? `${first.toUpperCase()}.` : '';
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Mask a card/ID number: keep last 4 characters.
 * `4111111111111111` → `************1111`
 * `WRIST-ABC-1234` → `**********1234`
 */
function maskIdentifier(value: string): string {
  if (!value || value.length <= 4) return '****';
  const last4 = value.slice(-4);
  const masked = '*'.repeat(value.length - 4);
  return `${masked}${last4}`;
}

/**
 * Mask a single value based on the column type and content.
 * Used for columns identified as PII by layer 1.
 */
function maskPiiValue(value: unknown, columnName: string): unknown {
  // Preserve nulls, undefined, and non-string primitives
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  // Handle JSONB objects — recursively mask string values
  if (typeof value === 'object' && !Array.isArray(value)) {
    return maskJsonbObject(value as Record<string, unknown>);
  }

  const str = String(value);
  if (str.length === 0) return str;

  const lower = columnName.toLowerCase();

  // Email columns
  if (lower.includes('email')) {
    EMAIL_PATTERN.lastIndex = 0;
    return EMAIL_PATTERN.test(str) ? maskEmail(str) : '[EMAIL]';
  }

  // Phone columns
  if (lower.includes('phone') || lower.includes('mobile') || lower.includes('fax') || lower === 'cell_phone') {
    return maskPhone(str);
  }

  // Name columns
  if (
    lower === 'name' ||
    lower.endsWith('_name') ||
    lower.includes('first_name') ||
    lower.includes('last_name') ||
    lower.includes('display_name') ||
    lower.includes('full_name') ||
    lower.includes('cardholder') ||
    lower.includes('recipient') ||
    lower.includes('firstname') ||
    lower.includes('lastname')
  ) {
    return maskName(str);
  }

  // Identity / card columns
  if (
    lower.includes('ssn') ||
    lower.includes('social_security') ||
    lower.includes('tax_id') ||
    lower.includes('card_number') ||
    lower.includes('wristband') ||
    lower.includes('identifier_value') ||
    lower.includes('account_number') ||
    lower.includes('passport') ||
    lower.includes('drivers_license') ||
    lower.includes('national_id')
  ) {
    return maskIdentifier(str);
  }

  // Address columns
  if (
    lower.includes('address') ||
    lower.includes('street') ||
    lower === 'city' ||
    lower.includes('zip') ||
    lower.includes('postal')
  ) {
    return '[REDACTED]';
  }

  // Password / token columns
  if (lower.includes('password') || lower === 'token') {
    return '[REDACTED]';
  }

  // Generic fallback for PII columns
  return '[REDACTED]';
}

/**
 * Recursively mask string values in a JSONB object.
 * Used for columns like `primary_guest_json` that embed PII in nested objects.
 */
function maskJsonbObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val == null) {
      result[key] = val;
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      result[key] = maskJsonbObject(val as Record<string, unknown>);
    } else if (typeof val === 'string' && isPiiColumn(key)) {
      result[key] = maskPiiValue(val, key);
    } else if (typeof val === 'string') {
      // Apply value-pattern detection to nested string fields
      result[key] = maskStringByContent(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Apply value-pattern detection to a string.
 * Replaces emails, phones, SSNs found in the text.
 */
function maskStringByContent(text: string): string {
  let result = text;
  for (const detector of VALUE_DETECTORS) {
    // Reset regex lastIndex for global patterns
    detector.pattern.lastIndex = 0;
    result = result.replace(detector.pattern, detector.mask);
  }
  return result;
}

// ── Public API ──────────────────────────────────────────────────────

export interface MaskOptions {
  /** Additional column names to treat as PII beyond the built-in heuristics */
  additionalPiiColumns?: string[];
}

/**
 * Mask PII in query result rows before sending to an LLM or storing in eval tables.
 *
 * Layer 1: Columns matching known PII name patterns are masked by type.
 * Layer 2: String values in remaining columns are scanned for email/phone/SSN patterns.
 *
 * Returns a new array — never mutates the input.
 */
export function maskRowsForLLM(
  rows: Record<string, unknown>[],
  opts?: MaskOptions,
): Record<string, unknown>[] {
  if (rows.length === 0) return [];

  // Build the set of PII columns for this result set
  const columns = Object.keys(rows[0]!);
  const piiColumns = new Set<string>();
  const additionalSet = new Set(opts?.additionalPiiColumns?.map((c) => c.toLowerCase()) ?? []);

  for (const col of columns) {
    if (isPiiColumn(col) || additionalSet.has(col.toLowerCase())) {
      piiColumns.add(col);
    }
  }

  return rows.map((row) => {
    const masked: Record<string, unknown> = {};

    for (const [col, val] of Object.entries(row)) {
      if (piiColumns.has(col)) {
        // Layer 1: column-name match → type-specific masking
        masked[col] = maskPiiValue(val, col);
      } else if (typeof val === 'string' && val.length > 0) {
        // Layer 2: value-pattern detection for non-PII columns
        masked[col] = maskStringByContent(val);
      } else if (typeof val === 'object' && val != null && !Array.isArray(val)) {
        // JSONB objects in non-PII columns — scan recursively
        masked[col] = maskJsonbObject(val as Record<string, unknown>);
      } else {
        // Numbers, booleans, dates, nulls — pass through
        masked[col] = val;
      }
    }

    return masked;
  });
}

/**
 * Mask PII patterns in free-form text (e.g., user messages stored in eval turns,
 * prior insights in agentic orchestrator prompts).
 *
 * Only applies value-pattern detection (emails, phones, SSNs).
 * Does NOT attempt name detection in free text (too many false positives).
 */
export function maskFreeText(text: string): string {
  if (!text) return text;
  return maskStringByContent(text);
}

// ── Exports for testing ──────────────────────────────────────────────

export { maskEmail as _maskEmail };
export { maskPhone as _maskPhone };
export { maskName as _maskName };
export { maskIdentifier as _maskIdentifier };
export { maskStringByContent as _maskStringByContent };
