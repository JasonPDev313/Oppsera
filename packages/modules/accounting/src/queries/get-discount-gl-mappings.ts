import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { DISCOUNT_CLASSIFICATIONS } from '@oppsera/shared';

export interface DiscountGlMappingRow {
  subDepartmentId: string;
  discountClassification: string;
  glAccountId: string;
  glAccountNumber: string | null;
  glAccountName: string | null;
}

export interface DiscountMappingCoverage {
  classification: string;
  label: string;
  glTreatment: string;
  mapped: number;
  total: number;
}

/**
 * Get all discount GL mappings for a tenant, joined with GL account display names.
 */
export async function getDiscountGlMappings(tenantId: string): Promise<DiscountGlMappingRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        dgm.sub_department_id,
        dgm.discount_classification,
        dgm.gl_account_id,
        ga.account_number AS gl_account_number,
        ga.name AS gl_account_name
      FROM discount_gl_mappings dgm
      LEFT JOIN gl_accounts ga ON ga.id = dgm.gl_account_id
      WHERE dgm.tenant_id = ${tenantId}
      ORDER BY dgm.sub_department_id, dgm.discount_classification
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map(row => ({
      subDepartmentId: String(row.sub_department_id),
      discountClassification: String(row.discount_classification),
      glAccountId: String(row.gl_account_id),
      glAccountNumber: row.gl_account_number ? String(row.gl_account_number) : null,
      glAccountName: row.gl_account_name ? String(row.gl_account_name) : null,
    }));
  });
}

/**
 * Get mapping coverage per classification — how many sub-departments
 * have a mapping for each discount classification vs total sub-departments.
 */
export async function getDiscountMappingCoverage(tenantId: string): Promise<DiscountMappingCoverage[]> {
  return withTenant(tenantId, async (tx) => {
    // Count total mappable sub-departments (from catalog hierarchy).
    // For 3-level hierarchies: sub-departments (parent_id IS NOT NULL).
    // For 2-level hierarchies: departments (parent_id IS NULL).
    // COALESCE(parent_id, id) collapses to the mappable entity in both cases.
    const totalRows = await tx.execute(sql`
      SELECT COUNT(DISTINCT COALESCE(parent_id, id))::int AS total
      FROM catalog_categories
      WHERE tenant_id = ${tenantId}
    `);
    const totalSubDepts = (Array.from(totalRows as Iterable<Record<string, unknown>>)[0]?.total as number) ?? 0;

    // Count mapped per classification
    const mappedRows = await tx.execute(sql`
      SELECT
        discount_classification,
        COUNT(DISTINCT sub_department_id)::int AS mapped
      FROM discount_gl_mappings
      WHERE tenant_id = ${tenantId}
      GROUP BY discount_classification
    `);

    const mappedMap = new Map<string, number>();
    for (const row of Array.from(mappedRows as Iterable<Record<string, unknown>>)) {
      mappedMap.set(String(row.discount_classification), row.mapped as number);
    }

    return DISCOUNT_CLASSIFICATIONS.map(def => ({
      classification: def.key,
      label: def.label,
      glTreatment: def.glTreatment,
      mapped: mappedMap.get(def.key) ?? 0,
      total: totalSubDepts,
    }));
  });
}
