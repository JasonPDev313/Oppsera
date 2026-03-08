/**
 * Safe SQL array helper for Drizzle's `sql` template tag.
 *
 * Drizzle's `sql` tag does NOT serialize JavaScript arrays as PostgreSQL arrays.
 * Passing `${jsArray}` to `ANY()` causes "malformed array literal" because Drizzle
 * expands the array into individual scalar parameters instead of a single array parameter.
 *
 * Usage:
 *   BEFORE (broken):  sql`WHERE id = ANY(${ids})`
 *   AFTER  (correct):  sql`WHERE id = ANY(${sqlArray(ids)})`
 *
 * Generates: `ARRAY[$1, $2, $3]::text[]` — a properly typed PostgreSQL array literal.
 *
 * @module
 */
import { sql } from 'drizzle-orm';

/**
 * Converts a JavaScript string array into a Drizzle SQL fragment representing
 * a PostgreSQL text[] array. Safe for use with `ANY()`, array operators, etc.
 *
 * Returns `ARRAY[]::text[]` for empty arrays (matches no rows in ANY()).
 */
export function sqlArray(values: string[]) {
  if (values.length === 0) {
    return sql`ARRAY[]::text[]`;
  }
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`;
}
