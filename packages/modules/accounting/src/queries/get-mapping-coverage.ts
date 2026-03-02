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
    const autoPostedCodes = AUTO_POSTED_TYPE_CODES.length > 0
      ? sql.join(AUTO_POSTED_TYPE_CODES.map(c => sql`${c}`), sql`, `)
      : null;

    const extractCount = (rows: unknown): number =>
      Number((Array.from(rows as Iterable<Record<string, unknown>>))[0]?.cnt ?? 0);

    // Run all 8 count queries in parallel
    const [
      subDeptMappedRows,
      subDeptTotalRows,
      paymentMappedRows,
      paymentTotalRows,
      taxMappedRows,
      taxTotalRows,
      unmappedRows,
      detailRows,
    ] = await Promise.all([
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM sub_department_gl_defaults
        WHERE tenant_id = ${input.tenantId}
          AND revenue_account_id IS NOT NULL
      `),
      tx.execute(sql`
        SELECT COUNT(DISTINCT COALESCE(parent_id, id))::int AS cnt
        FROM catalog_categories
        WHERE tenant_id = ${input.tenantId}
          AND is_active = true
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM payment_type_gl_defaults
        WHERE tenant_id = ${input.tenantId}
          AND cash_account_id IS NOT NULL
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM gl_transaction_types
        WHERE (tenant_id IS NULL OR tenant_id = ${input.tenantId})
          AND is_active = true
          ${autoPostedCodes ? sql`AND code NOT IN (${autoPostedCodes})` : sql``}
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM tax_group_gl_defaults
        WHERE tenant_id = ${input.tenantId}
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM tax_groups
        WHERE tenant_id = ${input.tenantId}
          AND is_active = true
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM gl_unmapped_events
        WHERE tenant_id = ${input.tenantId}
          AND resolved_at IS NULL
      `),
      tx.execute(sql`
        SELECT entity_type, entity_id, reason
        FROM gl_unmapped_events
        WHERE tenant_id = ${input.tenantId}
          AND resolved_at IS NULL
        ORDER BY created_at DESC
        LIMIT 100
      `),
    ]);

    const subDeptMapped = extractCount(subDeptMappedRows);
    const subDeptTotal = extractCount(subDeptTotalRows);
    const paymentMapped = extractCount(paymentMappedRows);
    const paymentTotal = extractCount(paymentTotalRows);
    const taxMapped = extractCount(taxMappedRows);
    const taxTotal = extractCount(taxTotalRows);
    const unmappedEventCount = extractCount(unmappedRows);

    const details = Array.from(detailRows as Iterable<Record<string, unknown>>).map((row) => ({
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      entityName: null,
      isMapped: false,
    }));

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
