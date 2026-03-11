import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CourseRuleListItem {
  id: string;
  scopeType: string;
  scopeId: string;
  scopeName: string | null;
  defaultCourseNumber: number | null;
  allowedCourseNumbers: number[] | null;
  lockCourse: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** True if defaultCourseNumber references a deactivated/missing course definition */
  staleDefault: boolean;
}

export interface ListCourseRulesInput {
  tenantId: string;
  locationId: string;
  scopeType?: string;
}

/**
 * List all course rules for a location, enriched with scope names from catalog_categories/items.
 * Also flags rules whose defaultCourseNumber references a deactivated or missing course definition.
 */
export async function listCourseRules(input: ListCourseRulesInput): Promise<CourseRuleListItem[]> {
  const { tenantId, locationId, scopeType } = input;

  const rows = await withTenant(tenantId, async (tx) => {
    const scopeFilter = scopeType
      ? sql` AND cr.scope_type = ${scopeType}`
      : sql``;

    return tx.execute(
      sql`SELECT cr.id, cr.scope_type, cr.scope_id,
                 cr.default_course_number, cr.allowed_course_numbers,
                 cr.lock_course, cr.is_active, cr.created_at, cr.updated_at,
                 COALESCE(cc.name, ci.name) AS scope_name,
                 CASE
                   WHEN cr.default_course_number IS NOT NULL
                     AND cd.id IS NULL THEN true
                   ELSE false
                 END AS stale_default
          FROM fnb_course_rules cr
          LEFT JOIN catalog_categories cc ON cc.id = cr.scope_id
            AND cr.scope_type IN ('department', 'sub_department', 'category')
          LEFT JOIN catalog_items ci ON ci.id = cr.scope_id
            AND cr.scope_type = 'item'
          LEFT JOIN fnb_course_definitions cd ON cd.tenant_id = cr.tenant_id
            AND cd.location_id = cr.location_id
            AND cd.course_number = cr.default_course_number
            AND cd.is_active = true
          WHERE cr.tenant_id = ${tenantId}
            AND cr.location_id = ${locationId}
            ${scopeFilter}
          ORDER BY
            CASE cr.scope_type
              WHEN 'department' THEN 1
              WHEN 'sub_department' THEN 2
              WHEN 'category' THEN 3
              WHEN 'item' THEN 4
            END,
            cr.created_at DESC`,
    );
  });

  return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    scopeType: r.scope_type as string,
    scopeId: r.scope_id as string,
    scopeName: (r.scope_name as string) ?? null,
    defaultCourseNumber: r.default_course_number as number | null,
    allowedCourseNumbers: r.allowed_course_numbers as number[] | null,
    lockCourse: r.lock_course as boolean,
    isActive: r.is_active as boolean,
    createdAt: (r.created_at as Date).toISOString(),
    updatedAt: (r.updated_at as Date).toISOString(),
    staleDefault: r.stale_default === true,
  }));
}
