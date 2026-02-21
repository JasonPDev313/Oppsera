import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface MappingCoverageDetail {
  entityType: string;
  entityId: string;
  entityName: string | null;
  isMapped: boolean;
}

export interface MappingCoverageReport {
  subDepartments: { mapped: number };
  paymentTypes: { mapped: number };
  taxGroups: { mapped: number };
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
    // Count existing GL mapping rows per entity type.
    // Since we can't query catalog tables directly (module isolation),
    // we only count the mapping rows that exist.

    // Sub-department mappings
    const subDeptRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM sub_department_gl_defaults
      WHERE tenant_id = ${input.tenantId}
    `);
    const subDeptArr = Array.from(subDeptRows as Iterable<Record<string, unknown>>);
    const subDeptMapped = Number(subDeptArr[0]?.cnt ?? 0);

    // Payment type mappings
    const paymentRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM payment_type_gl_defaults
      WHERE tenant_id = ${input.tenantId}
    `);
    const paymentArr = Array.from(paymentRows as Iterable<Record<string, unknown>>);
    const paymentMapped = Number(paymentArr[0]?.cnt ?? 0);

    // Tax group mappings
    const taxRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM tax_group_gl_defaults
      WHERE tenant_id = ${input.tenantId}
    `);
    const taxArr = Array.from(taxRows as Iterable<Record<string, unknown>>);
    const taxMapped = Number(taxArr[0]?.cnt ?? 0);

    // Count unresolved unmapped events (the "unmapped" signal)
    const unmappedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM gl_unmapped_events
      WHERE tenant_id = ${input.tenantId}
        AND resolved_at IS NULL
    `);
    const unmappedArr = Array.from(unmappedRows as Iterable<Record<string, unknown>>);
    const unmappedEventCount = Number(unmappedArr[0]?.cnt ?? 0);

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

    return {
      subDepartments: { mapped: subDeptMapped },
      paymentTypes: { mapped: paymentMapped },
      taxGroups: { mapped: taxMapped },
      unmappedEventCount,
      details,
    };
  });
}
