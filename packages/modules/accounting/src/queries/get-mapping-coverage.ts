import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  AUTO_POSTED_TYPE_CODES,
  DISCOUNT_CLASSIFICATIONS,
  TRANSACTION_TYPE_CATEGORY_ORDER,
  getMappedStatusRule,
} from '@oppsera/shared';
import type { TransactionTypeCategory } from '@oppsera/shared';

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
  discounts: { mapped: number; total: number };
  overallPercentage: number;
  unmappedEventCount: number;
  details: MappingCoverageDetail[];
}

interface GetMappingCoverageInput {
  tenantId: string;
}

/**
 * Build the CASE expression for transaction type "is mapped" from the
 * canonical getMappedStatusRule() so it can never drift from the UI logic
 * in computeIsMapped (get-transaction-type-mappings.ts).
 */
function buildMappedCaseExpr(): SQL {
  const ruleToSql: Record<string, SQL> = {
    debit: sql`ttm.debit_account_id IS NOT NULL`,
    credit: sql`ttm.credit_account_id IS NOT NULL`,
    both: sql`(ttm.credit_account_id IS NOT NULL AND ttm.debit_account_id IS NOT NULL)`,
    either: sql`(ttm.credit_account_id IS NOT NULL OR ttm.debit_account_id IS NOT NULL)`,
  };

  const whens: SQL[] = [];
  for (const cat of TRANSACTION_TYPE_CATEGORY_ORDER) {
    const rule = getMappedStatusRule(cat as TransactionTypeCategory);
    const condition = ruleToSql[rule];
    whens.push(sql`WHEN ${cat} THEN ${condition}`);
  }

  // Fallback for any future category: require both sides (strictest)
  return sql`CASE gtt.category ${sql.join(whens, sql` `)} ELSE (ttm.credit_account_id IS NOT NULL AND ttm.debit_account_id IS NOT NULL) END`;
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

    const numClassifications = DISCOUNT_CLASSIFICATIONS.length;
    const mappedCase = buildMappedCaseExpr();

    // Run all count queries in parallel.
    // NOTE: subDeptTotalRows is reused for both department and discount totals
    // (both need active sub-department count) — avoids a duplicate query.
    const [
      subDeptMappedRows,
      subDeptTotalRows,
      paymentMappedRows,
      paymentTotalRows,
      taxMappedRows,
      taxTotalRows,
      discountMappedRows,
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
        FROM gl_transaction_types gtt
        LEFT JOIN gl_transaction_type_mappings ttm
          ON ttm.tenant_id = ${input.tenantId}
          AND ttm.transaction_type_code = gtt.code
          AND ttm.location_id IS NULL
        WHERE (gtt.tenant_id IS NULL OR gtt.tenant_id = ${input.tenantId})
          AND gtt.is_active = true
          AND (
            ${autoPostedCodes ? sql`gtt.code IN (${autoPostedCodes})` : sql`false`}
            OR ${mappedCase}
          )
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM gl_transaction_types
        WHERE (tenant_id IS NULL OR tenant_id = ${input.tenantId})
          AND is_active = true
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM tax_group_gl_defaults
        WHERE tenant_id = ${input.tenantId}
          AND tax_payable_account_id IS NOT NULL
      `),
      tx.execute(sql`
        SELECT COUNT(*)::int AS cnt
        FROM tax_groups
        WHERE tenant_id = ${input.tenantId}
          AND is_active = true
      `),
      tx.execute(sql`
        SELECT COUNT(DISTINCT (sub_department_id, discount_classification))::int AS cnt
        FROM discount_gl_mappings
        WHERE tenant_id = ${input.tenantId}
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
    const discountTotal = subDeptTotal * numClassifications;
    // Clamp: stale mappings on deactivated sub-departments can exceed total
    const discountMapped = Math.min(extractCount(discountMappedRows), discountTotal);
    const unmappedEventCount = extractCount(unmappedRows);

    const details = Array.from(detailRows as Iterable<Record<string, unknown>>).map((row) => ({
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      entityName: null,
      isMapped: false,
    }));

    const totalMapped = subDeptMapped + paymentMapped + taxMapped + discountMapped;
    const totalAll = subDeptTotal + paymentTotal + taxTotal + discountTotal;
    const overallPercentage = totalAll > 0
      ? Math.round((totalMapped / totalAll) * 100)
      : 0;

    return {
      departments: { mapped: subDeptMapped, total: subDeptTotal },
      paymentTypes: { mapped: paymentMapped, total: paymentTotal },
      taxGroups: { mapped: taxMapped, total: taxTotal },
      discounts: { mapped: discountMapped, total: discountTotal },
      overallPercentage,
      unmappedEventCount,
      details,
    };
  });
}
