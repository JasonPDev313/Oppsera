import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AUTO_POSTED_TYPE_CODES } from '@oppsera/shared';

export interface MappingCoverageDetail {
  entityType: string;
  entityId: string;
  entityName: string | null;
  isMapped: boolean;
}

export interface MappingCoverageReport {
  departments: { mapped: number; total: number };
  paymentTypes: { mapped: number; total: number };
  taxGroups: { mapped: number; total: number };
  overallPercentage: number;
  unmappedEventCount: number;
  details: MappingCoverageDetail[];
}

interface GetMappingCoverageInput {
  tenantId: string;
}

export async function getMappingCoverage(
  input: GetMappingCoverageInput,
): Promise<MappingCoverageReport> {
  return withTenant(input.tenantId, async (tx) => {
    // ── Sub-department / department mappings ──────────────────
    // Count mapped: rows in sub_department_gl_defaults with a revenue account
    const subDeptMappedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM sub_department_gl_defaults
      WHERE tenant_id = ${input.tenantId}
        AND revenue_account_id IS NOT NULL
    `);
    const subDeptMapped = Number(
      (Array.from(subDeptMappedRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // Count total: mappable category entities from catalog
    // Uses same COALESCE(parent_id, id) logic as getSubDepartmentMappings
    const subDeptTotalRows = await tx.execute(sql`
      SELECT COUNT(DISTINCT COALESCE(parent_id, id))::int AS cnt
      FROM catalog_categories
      WHERE tenant_id = ${input.tenantId}
        AND is_active = true
    `);
    const subDeptTotal = Number(
      (Array.from(subDeptTotalRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // ── Payment type mappings ────────────────────────────────
    const paymentMappedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM payment_type_gl_defaults
      WHERE tenant_id = ${input.tenantId}
        AND cash_account_id IS NOT NULL
    `);
    const paymentMapped = Number(
      (Array.from(paymentMappedRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // Total from transaction type registry (system + tenant custom)
    // Exclude auto-posted types (e.g., void) that don't require manual GL mapping
    const autoPostedCodes = AUTO_POSTED_TYPE_CODES.length > 0
      ? sql.join(AUTO_POSTED_TYPE_CODES.map(c => sql`${c}`), sql`, `)
      : null;
    const paymentTotalRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM gl_transaction_types
      WHERE (tenant_id IS NULL OR tenant_id = ${input.tenantId})
        AND is_active = true
        ${autoPostedCodes ? sql`AND code NOT IN (${autoPostedCodes})` : sql``}
    `);
    const paymentTotal = Number(
      (Array.from(paymentTotalRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // ── Tax group mappings ───────────────────────────────────
    const taxMappedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM tax_group_gl_defaults
      WHERE tenant_id = ${input.tenantId}
    `);
    const taxMapped = Number(
      (Array.from(taxMappedRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // Total active tax groups from catalog
    const taxTotalRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM tax_groups
      WHERE tenant_id = ${input.tenantId}
        AND is_active = true
    `);
    const taxTotal = Number(
      (Array.from(taxTotalRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // ── Unmapped events ──────────────────────────────────────
    const unmappedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM gl_unmapped_events
      WHERE tenant_id = ${input.tenantId}
        AND resolved_at IS NULL
    `);
    const unmappedEventCount = Number(
      (Array.from(unmappedRows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0,
    );

    // Build details from unresolved unmapped events (latest 100)
    const detailRows = await tx.execute(sql`
      SELECT
        entity_type,
        entity_id,
        reason
      FROM gl_unmapped_events
      WHERE tenant_id = ${input.tenantId}
        AND resolved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const details = Array.from(detailRows as Iterable<Record<string, unknown>>).map((row) => ({
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      entityName: null,
      isMapped: false,
    }));

    // ── Overall percentage ───────────────────────────────────
    const totalMapped = subDeptMapped + paymentMapped + taxMapped;
    const totalAll = subDeptTotal + paymentTotal + taxTotal;
    const overallPercentage = totalAll > 0
      ? Math.round((totalMapped / totalAll) * 100)
      : 0;

    return {
      departments: { mapped: subDeptMapped, total: subDeptTotal },
      paymentTypes: { mapped: paymentMapped, total: paymentTotal },
      taxGroups: { mapped: taxMapped, total: taxTotal },
      overallPercentage,
      unmappedEventCount,
      details,
    };
  });
}
