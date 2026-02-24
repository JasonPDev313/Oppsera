// ── SQL Validator ────────────────────────────────────────────────
// Defense-in-depth validation of LLM-generated SQL before execution.
// RLS is the primary security layer — this is an additional guard.

export interface SqlValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedSql: string;
}

// ── Constants ────────────────────────────────────────────────────

const MAX_SQL_LENGTH = 10_000;
const MAX_ROW_LIMIT = 500;

// DDL keywords that must never appear
const DDL_KEYWORDS = /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b/i;

// DML keywords that must never appear
const DML_KEYWORDS = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT)\b/i;

// Dangerous Postgres functions
const DANGEROUS_FUNCTIONS = /\b(pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_read_file|pg_write_file|pg_ls_dir|lo_import|lo_export|set_config|current_setting|pg_reload_conf|pg_rotate_logfile|dblink|copy)\s*\(/i;

// Transaction control (should not appear in user-generated SQL)
const TX_CONTROL = /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

// Utility commands
const UTILITY_CMDS = /\b(VACUUM|ANALYZE|REINDEX|CLUSTER|REFRESH|NOTIFY|LISTEN|UNLISTEN|EXPLAIN)\b/i;

// ── Validator ────────────────────────────────────────────────────

export function validateGeneratedSql(
  sql: string,
  allowedTables: Set<string>,
): SqlValidationResult {
  const errors: string[] = [];
  let sanitized = sql.trim();

  // 1. Length check
  if (sanitized.length > MAX_SQL_LENGTH) {
    errors.push(`SQL exceeds maximum length of ${MAX_SQL_LENGTH} characters`);
    return { valid: false, errors, sanitizedSql: sanitized };
  }

  // 2. Must start with SELECT (or WITH for CTEs)
  if (!/^\s*(SELECT|WITH)\b/i.test(sanitized)) {
    errors.push('SQL must start with SELECT or WITH (CTE)');
  }

  // 3. No DDL
  if (DDL_KEYWORDS.test(sanitized)) {
    errors.push('SQL contains DDL keywords (CREATE, ALTER, DROP, etc.)');
  }

  // 4. No DML
  if (DML_KEYWORDS.test(sanitized)) {
    errors.push('SQL contains DML keywords (INSERT, UPDATE, DELETE, etc.)');
  }

  // 5. No dangerous functions
  if (DANGEROUS_FUNCTIONS.test(sanitized)) {
    errors.push('SQL contains dangerous function calls');
  }

  // 6. No transaction control
  if (TX_CONTROL.test(sanitized)) {
    errors.push('SQL contains transaction control statements');
  }

  // 7. No utility commands
  if (UTILITY_CMDS.test(sanitized)) {
    errors.push('SQL contains utility commands (VACUUM, EXPLAIN, etc.)');
  }

  // 8. No semicolons (prevent multi-statement injection)
  if (sanitized.includes(';')) {
    // Strip trailing semicolon (common LLM habit) but reject internal ones
    if (sanitized.endsWith(';')) {
      sanitized = sanitized.slice(0, -1).trim();
    }
    if (sanitized.includes(';')) {
      errors.push('SQL contains multiple statements (semicolons)');
    }
  }

  // 9. No SQL comments (prevent comment-based injection)
  if (/--/.test(sanitized) || /\/\*/.test(sanitized)) {
    errors.push('SQL contains comments (-- or /* */)');
  }

  // 10. Must reference tenant_id in WHERE (parameterized as $1)
  if (!/tenant_id\s*=\s*\$1/i.test(sanitized)) {
    errors.push('SQL must include tenant_id = $1 in WHERE clause');
  }

  // 11. Must have a LIMIT clause — unless it's an aggregate query (COUNT/SUM/AVG/etc.)
  //     Aggregate queries naturally return a single row, so LIMIT is unnecessary.
  const isAggregateOnly = /^\s*(SELECT|WITH\b[\s\S]*?\)\s*SELECT)\s+(?:[\s\S]*?\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\()/i.test(sanitized)
    && !/\bLIMIT\b/i.test(sanitized);
  const limitMatch = sanitized.match(/\bLIMIT\s+(\d+)/i);
  if (!limitMatch && !isAggregateOnly) {
    errors.push('SQL must include a LIMIT clause');
  } else if (limitMatch) {
    const limitVal = parseInt(limitMatch[1]!, 10);
    if (limitVal > MAX_ROW_LIMIT) {
      errors.push(`LIMIT ${limitVal} exceeds maximum of ${MAX_ROW_LIMIT}`);
    }
  }

  // 12. Table whitelist check
  // Extract table names from FROM and JOIN clauses
  const tableRefs = extractTableReferences(sanitized);
  for (const table of tableRefs) {
    if (!allowedTables.has(table)) {
      errors.push(`Table "${table}" is not in the allowed schema catalog`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedSql: sanitized,
  };
}

// ── Table reference extraction ───────────────────────────────────
// Extracts table names from FROM and JOIN clauses.
// Not a full SQL parser — covers the common patterns LLMs generate.

function extractTableReferences(sql: string): string[] {
  const tables = new Set<string>();

  // Match FROM table_name (with optional alias)
  const fromMatches = sql.matchAll(/\bFROM\s+([a-z_][a-z0-9_]*)/gi);
  for (const m of fromMatches) {
    tables.add(m[1]!.toLowerCase());
  }

  // Match JOIN table_name (any type of join)
  const joinMatches = sql.matchAll(/\bJOIN\s+([a-z_][a-z0-9_]*)/gi);
  for (const m of joinMatches) {
    tables.add(m[1]!.toLowerCase());
  }

  // Match subquery FROM/JOIN in CTEs
  // Already covered by the above patterns since we search the full SQL

  return Array.from(tables);
}

// ── Exports for testing ──────────────────────────────────────────

export { extractTableReferences as _extractTableReferences };
