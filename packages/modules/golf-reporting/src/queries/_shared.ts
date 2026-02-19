import { sql } from 'drizzle-orm';

/** Convert NUMERIC string (or number/null) to JS number, default 0. */
export const num = (v: string | number | null | undefined): number => Number(v) || 0;

/** Divide-by-zero safe division, returns 0 when denominator is 0. */
export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** Convert a fraction (0-1) to basis points (0-10000), rounded to integer. */
export function toBps(fraction: number): number {
  return Math.round(fraction * 10000);
}

/**
 * Build a SQL fragment for filtering by course_id.
 *
 * - courseId provided → `AND course_id = $courseId`
 * - locationId provided → `AND course_id IN (SELECT id FROM courses WHERE location_id = $loc AND tenant_id = $tid)`
 * - neither → empty (all courses for tenant)
 */
export function courseFilterSql(
  tenantId: string,
  courseId?: string,
  locationId?: string,
) {
  if (courseId) {
    return sql`AND course_id = ${courseId}`;
  }
  if (locationId) {
    return sql`AND course_id IN (SELECT id FROM courses WHERE location_id = ${locationId} AND tenant_id = ${tenantId})`;
  }
  return sql``;
}
