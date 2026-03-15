// ── Content Guard ─────────────────────────────────────────────────────────────
//
// Post-processing filter for assistant responses.
// In customer mode, strips any accidentally leaked internal content.
// Staff mode sees everything — no filtering applied.

// ── Patterns to strip in customer mode ───────────────────────────────────────

/** API endpoint paths like /api/v1/orders or /api/v1/something/[id] */
const API_PATH_RE = /\/api\/v\d+\/[a-zA-Z0-9/_[\]-]*/g;

/** Database table names (snake_case with 2+ segments typical of DB tables) */
const DB_TABLE_RE =
  /\b(?:ai_support|ai_assistant|fnb_kds|fnb_orders|catalog_products|inventory_|accounting_|ap_|ar_|tenant_|location_|orders_|payments_|membership_|spa_|kds_|pms_|customers_|golf_|import_|marketing_|expenses_|project_|room_|semantic_|business_|voucher_|evaluation_|employee_|staff_|user_|role_)\w+\b/gi;

/** Internal module package names */
const INTERNAL_MODULE_RE = /@oppsera\/(module-\w+|core|db|shared)\b/g;

/** Internal URLs (localhost or internal hostnames) */
const INTERNAL_URL_RE = /https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?[^\s]*/g;

/** Connection strings or DSNs */
const CONNECTION_STRING_RE =
  /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/[^\s"'<>]*/gi;

/** Stack traces (at X (file.ts:line:col) patterns) */
const STACK_TRACE_RE = /at\s+[\w.<>]+\s+\([^)]+\.(?:ts|js|tsx|jsx):\d+:\d+\)/g;

/** Environment variable references */
const ENV_VAR_RE = /process\.env\.\w+/g;

// ── Non-global copies for .test() usage ──────────────────────────────────────
// The module-level regexes above use the `g` flag for .replace() calls in
// sanitizeResponse. Global regexes share lastIndex state across calls, so they
// MUST NOT be used with .test() directly — .test() advances lastIndex and
// subsequent calls start mid-string, producing alternating true/false results.
// These non-global copies are used exclusively in validateCustomerSafe.

const API_PATH_TEST_RE = /\/api\/v\d+\/[a-zA-Z0-9/_[\]-]*/;
const DB_TABLE_TEST_RE =
  /\b(?:ai_support|ai_assistant|fnb_kds|fnb_orders|catalog_products|inventory_|accounting_|ap_|ar_|tenant_|location_|orders_|payments_|membership_|spa_|kds_|pms_|customers_|golf_|import_|marketing_|expenses_|project_|room_|semantic_|business_|voucher_|evaluation_|employee_|staff_|user_|role_)\w+\b/i;
const INTERNAL_MODULE_TEST_RE = /@oppsera\/(module-\w+|core|db|shared)\b/;
const _INTERNAL_URL_TEST_RE = /https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?[^\s]*/;
const CONNECTION_STRING_TEST_RE =
  /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/[^\s"'<>]*/i;
const STACK_TRACE_TEST_RE = /at\s+[\w.<>]+\s+\([^)]+\.(?:ts|js|tsx|jsx):\d+:\d+\)/;
const ENV_VAR_TEST_RE = /process\.env\.\w+/;

// ── Replacement messages ──────────────────────────────────────────────────────

const STRIPPED_PLACEHOLDER = '[internal detail removed]';

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Sanitize an assistant response for the given mode.
 *
 * - `staff` mode: returns text unchanged — staff users can see technical details.
 * - `customer` mode: strips API paths, code patterns, DB references, internal URLs,
 *   connection strings, stack traces, and anything that looks like a secret.
 */
export function sanitizeResponse(text: string, mode: 'customer' | 'staff'): string {
  if (mode === 'staff') return text;

  let sanitized = text;

  // Strip API paths
  sanitized = sanitized.replace(API_PATH_RE, STRIPPED_PLACEHOLDER);

  // Strip internal module package names
  sanitized = sanitized.replace(INTERNAL_MODULE_RE, STRIPPED_PLACEHOLDER);

  // Strip DB table name references
  sanitized = sanitized.replace(DB_TABLE_RE, STRIPPED_PLACEHOLDER);

  // Strip connection strings (before general URL handling)
  sanitized = sanitized.replace(CONNECTION_STRING_RE, STRIPPED_PLACEHOLDER);

  // Strip internal URLs
  sanitized = sanitized.replace(INTERNAL_URL_RE, STRIPPED_PLACEHOLDER);

  // Strip stack traces
  sanitized = sanitized.replace(STACK_TRACE_RE, STRIPPED_PLACEHOLDER);

  // Strip environment variable references
  sanitized = sanitized.replace(ENV_VAR_RE, STRIPPED_PLACEHOLDER);

  // Strip inline backtick code spans before line-level scan
  sanitized = sanitized.replace(/`[^`]+`/g, '[code]');

  // Strip code-like patterns (lines that look like code)
  sanitized = sanitizeCodeLines(sanitized);

  return sanitized.trim();
}

/**
 * Strip individual lines that look like code.
 * We check each line: if it matches a code pattern, we remove it.
 * This is intentionally conservative — we only strip lines that
 * are clearly code, not prose that happens to contain a keyword.
 */
function sanitizeCodeLines(text: string): string {
  const lines = text.split('\n');
  // Track code fence state with a linear scan (not indexOf, which can
  // match the wrong occurrence when duplicate lines exist).
  let insideFence = false;

  const sanitizedLines = lines.map((line) => {
    const trimmed = line.trim();

    // Toggle fence state on ``` delimiters
    if (trimmed.startsWith('```')) {
      insideFence = !insideFence;
      return STRIPPED_PLACEHOLDER;
    }

    // Skip empty lines
    if (!trimmed) return line;

    // Strip all content inside code fences
    if (insideFence) {
      return STRIPPED_PLACEHOLDER;
    }

    // Skip markdown headers (not code)
    if (trimmed.startsWith('#')) {
      return line;
    }

    // For bullet-list lines, apply code-pattern checks to the item content
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
      const bulletContent = trimmed.replace(/^[-*]\s*/, '');
      if (
        /^(?:import|export)\s+/.test(bulletContent) ||
        /^(?:async\s+)?function\s+\w+/.test(bulletContent) ||
        /^(?:const|let|var)\s+\w+\s*=/.test(bulletContent) ||
        /^class\s+\w+/.test(bulletContent)
      ) {
        return STRIPPED_PLACEHOLDER;
      }
      return line;
    }

    // If the line looks like an import/export statement
    if (/^(?:import|export)\s+/.test(trimmed)) {
      return STRIPPED_PLACEHOLDER;
    }

    // If the line looks like a function definition
    if (/^(?:async\s+)?function\s+\w+/.test(trimmed)) {
      return STRIPPED_PLACEHOLDER;
    }

    // If the line looks like a const/let/var declaration with assignment
    if (/^(?:const|let|var)\s+\w+\s*=/.test(trimmed)) {
      return STRIPPED_PLACEHOLDER;
    }

    return line;
  });

  return sanitizedLines.join('\n');
}

/**
 * Check if text contains any internal content that should not be shown to customers.
 * Returns true if the text appears clean, false if it contains suspicious content.
 */
export function validateCustomerSafe(text: string): {
  safe: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (API_PATH_TEST_RE.test(text)) violations.push('api_path');
  if (INTERNAL_MODULE_TEST_RE.test(text)) violations.push('internal_module');
  if (DB_TABLE_TEST_RE.test(text)) violations.push('db_table');
  if (CONNECTION_STRING_TEST_RE.test(text)) violations.push('connection_string');
  if (STACK_TRACE_TEST_RE.test(text)) violations.push('stack_trace');
  if (ENV_VAR_TEST_RE.test(text)) violations.push('env_var');

  return { safe: violations.length === 0, violations };
}
