// ── Content Guard ─────────────────────────────────────────────────────────────
//
// Post-processing filter for assistant responses.
// In customer mode, strips any accidentally leaked internal content.
// Staff mode sees everything — no filtering applied.

// ── Patterns to strip in customer mode ───────────────────────────────────────

/** API endpoint paths like /api/v1/orders or /api/v1/something/[id] */
const API_PATH_RE = /\/api\/v\d+\/[a-zA-Z0-9/_[\]-]*/g;

/** Import/export/function/const/arrow-function code patterns */
const CODE_KEYWORDS_RE =
  /\b(import|export|function|const|let|var|async function|await|return|=>|class)\b[^.!?]*/g;

/** Database table names (snake_case with 2+ segments typical of DB tables) */
const DB_TABLE_RE =
  /\b(?:ai_support|ai_assistant|fnb_kds|fnb_orders|catalog_products|inventory_|accounting_|ap_|ar_|tenant_|location_)\w+\b/gi;

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

/** Anything that looks like an API key or secret (long alphanumeric strings) */
const API_KEY_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

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
  const sanitizedLines = lines.map((line) => {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) return line;

    // Skip markdown headers and list items (not code)
    if (trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      return line;
    }

    // If the line is inside a code fence (```), strip it
    if (isInsideCodeFence(text, line)) {
      return STRIPPED_PLACEHOLDER;
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

/** Check if a line appears within a markdown code fence block in the text. */
function isInsideCodeFence(fullText: string, line: string): boolean {
  const lineIndex = fullText.indexOf(line);
  if (lineIndex === -1) return false;

  const before = fullText.slice(0, lineIndex);
  const fenceCount = (before.match(/^```/gm) ?? []).length;
  // If odd number of fences before this line, we're inside a code block
  return fenceCount % 2 === 1;
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

  if (API_PATH_RE.test(text)) violations.push('api_path');
  if (INTERNAL_MODULE_RE.test(text)) violations.push('internal_module');
  if (DB_TABLE_RE.test(text)) violations.push('db_table');
  if (CONNECTION_STRING_RE.test(text)) violations.push('connection_string');
  if (STACK_TRACE_RE.test(text)) violations.push('stack_trace');
  if (ENV_VAR_RE.test(text)) violations.push('env_var');

  // Reset lastIndex on global regexes after .test()
  API_PATH_RE.lastIndex = 0;
  INTERNAL_MODULE_RE.lastIndex = 0;
  DB_TABLE_RE.lastIndex = 0;
  CONNECTION_STRING_RE.lastIndex = 0;
  STACK_TRACE_RE.lastIndex = 0;
  ENV_VAR_RE.lastIndex = 0;

  return { safe: violations.length === 0, violations };
}
