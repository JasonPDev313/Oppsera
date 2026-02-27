import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export interface SubDeptGL {
  subDepartmentId: string;
  revenueAccountId: string;
  cogsAccountId: string | null;
  inventoryAccountId: string | null;
  discountAccountId: string | null;
  returnsAccountId: string | null;
}

export interface PaymentTypeGL {
  paymentTypeId: string;
  depositAccountId: string;
  clearingAccountId: string | null;
  feeExpenseAccountId: string | null;
}

export interface UnmappedEventParams {
  eventType: string;
  sourceModule: string;
  sourceReferenceId?: string;
  entityType: string;
  entityId: string;
  reason: string;
}

/**
 * Resolve GL account mapping for a sub-department.
 * Returns null if no mapping is found.
 */
export async function resolveSubDepartmentAccounts(
  tx: Database,
  tenantId: string,
  subDepartmentId: string,
): Promise<SubDeptGL | null> {
  const rows = await tx.execute(sql`
    SELECT
      sub_department_id,
      revenue_account_id,
      cogs_account_id,
      inventory_asset_account_id,
      discount_account_id,
      returns_account_id
    FROM sub_department_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND sub_department_id = ${subDepartmentId}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return null;
  }

  const row = arr[0]!;
  return {
    subDepartmentId: String(row.sub_department_id),
    revenueAccountId: String(row.revenue_account_id),
    cogsAccountId: row.cogs_account_id ? String(row.cogs_account_id) : null,
    inventoryAccountId: row.inventory_asset_account_id ? String(row.inventory_asset_account_id) : null,
    discountAccountId: row.discount_account_id ? String(row.discount_account_id) : null,
    returnsAccountId: row.returns_account_id ? String(row.returns_account_id) : null,
  };
}

/**
 * Resolve GL account mapping for a payment type (cash, card, etc.).
 * Returns null if no mapping is found.
 */
export async function resolvePaymentTypeAccounts(
  tx: Database,
  tenantId: string,
  paymentTypeId: string,
): Promise<PaymentTypeGL | null> {
  const rows = await tx.execute(sql`
    SELECT
      payment_type_id,
      cash_account_id,
      clearing_account_id,
      fee_expense_account_id
    FROM payment_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND payment_type_id = ${paymentTypeId}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return null;
  }

  const row = arr[0]!;
  return {
    paymentTypeId: String(row.payment_type_id),
    depositAccountId: String(row.cash_account_id),
    clearingAccountId: row.clearing_account_id ? String(row.clearing_account_id) : null,
    feeExpenseAccountId: row.fee_expense_account_id ? String(row.fee_expense_account_id) : null,
  };
}

/**
 * Resolve the GL account ID for a tax group.
 * Returns null if no mapping is found.
 */
export async function resolveTaxGroupAccount(
  tx: Database,
  tenantId: string,
  taxGroupId: string,
): Promise<string | null> {
  const rows = await tx.execute(sql`
    SELECT tax_payable_account_id
    FROM tax_group_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND tax_group_id = ${taxGroupId}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return null;
  }

  return arr[0]!.tax_payable_account_id
    ? String(arr[0]!.tax_payable_account_id)
    : null;
}

/**
 * Resolve the GL account for a PMS folio entry type.
 * Returns null if no mapping is found.
 */
export async function resolveFolioEntryTypeAccount(
  tx: Database,
  tenantId: string,
  entryType: string,
): Promise<string | null> {
  const rows = await tx.execute(sql`
    SELECT account_id
    FROM pms_folio_entry_type_gl_defaults
    WHERE tenant_id = ${tenantId}
      AND entry_type = ${entryType}
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) return null;
  return arr[0]!.account_id ? String(arr[0]!.account_id) : null;
}

/**
 * Resolve GL account mapping for a transaction type (Credit/Debit model).
 * Returns null if no mapping is found.
 */
export interface TransactionTypeGL {
  transactionTypeCode: string;
  creditAccountId: string | null;
  debitAccountId: string | null;
}

export async function resolveTransactionTypeMapping(
  tx: Database,
  tenantId: string,
  code: string,
  locationId?: string | null,
): Promise<TransactionTypeGL | null> {
  // Try location-specific first, then tenant-wide
  const rows = await tx.execute(sql`
    SELECT transaction_type_code, credit_account_id, debit_account_id
    FROM gl_transaction_type_mappings
    WHERE tenant_id = ${tenantId}
      AND transaction_type_code = ${code}
      AND (location_id = ${locationId ?? null} OR location_id IS NULL)
    ORDER BY location_id IS NULL ASC
    LIMIT 1
  `);

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  if (arr.length === 0) {
    return null;
  }

  const row = arr[0]!;
  return {
    transactionTypeCode: String(row.transaction_type_code),
    creditAccountId: row.credit_account_id ? String(row.credit_account_id) : null,
    debitAccountId: row.debit_account_id ? String(row.debit_account_id) : null,
  };
}

/**
 * Batch-fetch all sub-department GL mappings for a tenant.
 * Returns a Map keyed by subDepartmentId for O(1) lookups.
 * Replaces N sequential resolveSubDepartmentAccounts calls with 1 query.
 */
export async function batchResolveSubDepartmentAccounts(
  tx: Database,
  tenantId: string,
): Promise<Map<string, SubDeptGL>> {
  const rows = await tx.execute(sql`
    SELECT
      sub_department_id,
      revenue_account_id,
      cogs_account_id,
      inventory_asset_account_id,
      discount_account_id,
      returns_account_id
    FROM sub_department_gl_defaults
    WHERE tenant_id = ${tenantId}
  `);

  const map = new Map<string, SubDeptGL>();
  for (const row of Array.from(rows as Iterable<Record<string, unknown>>)) {
    const id = String(row.sub_department_id);
    map.set(id, {
      subDepartmentId: id,
      revenueAccountId: String(row.revenue_account_id),
      cogsAccountId: row.cogs_account_id ? String(row.cogs_account_id) : null,
      inventoryAccountId: row.inventory_asset_account_id ? String(row.inventory_asset_account_id) : null,
      discountAccountId: row.discount_account_id ? String(row.discount_account_id) : null,
      returnsAccountId: row.returns_account_id ? String(row.returns_account_id) : null,
    });
  }
  return map;
}

/**
 * Batch-fetch all tax group GL mappings for a tenant.
 * Returns a Map keyed by taxGroupId for O(1) lookups.
 * Replaces N sequential resolveTaxGroupAccount calls with 1 query.
 */
export async function batchResolveTaxGroupAccounts(
  tx: Database,
  tenantId: string,
): Promise<Map<string, string>> {
  const rows = await tx.execute(sql`
    SELECT tax_group_id, tax_payable_account_id
    FROM tax_group_gl_defaults
    WHERE tenant_id = ${tenantId}
  `);

  const map = new Map<string, string>();
  for (const row of Array.from(rows as Iterable<Record<string, unknown>>)) {
    if (row.tax_payable_account_id) {
      map.set(String(row.tax_group_id), String(row.tax_payable_account_id));
    }
  }
  return map;
}

/**
 * Batch-fetch all discount classification GL mappings for a tenant.
 * Returns a nested Map: subDepartmentId → classification → glAccountId.
 * Used by the POS adapter for per-classification GL posting.
 */
export async function batchResolveDiscountGlMappings(
  tx: Database,
  tenantId: string,
): Promise<Map<string, Map<string, string>>> {
  const rows = await tx.execute(sql`
    SELECT sub_department_id, discount_classification, gl_account_id
    FROM discount_gl_mappings
    WHERE tenant_id = ${tenantId}
  `);

  const map = new Map<string, Map<string, string>>();
  for (const row of Array.from(rows as Iterable<Record<string, unknown>>)) {
    const subDeptId = String(row.sub_department_id);
    const classification = String(row.discount_classification);
    const accountId = String(row.gl_account_id);

    let inner = map.get(subDeptId);
    if (!inner) {
      inner = new Map<string, string>();
      map.set(subDeptId, inner);
    }
    inner.set(classification, accountId);
  }
  return map;
}

/**
 * Log an unmapped event for later resolution.
 * Called when a GL mapping is missing during automated posting.
 */
export async function logUnmappedEvent(
  tx: Database,
  tenantId: string,
  params: UnmappedEventParams,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO gl_unmapped_events (
      id,
      tenant_id,
      event_type,
      source_module,
      source_reference_id,
      entity_type,
      entity_id,
      reason,
      created_at
    ) VALUES (
      ${generateUlid()},
      ${tenantId},
      ${params.eventType},
      ${params.sourceModule},
      ${params.sourceReferenceId ?? null},
      ${params.entityType},
      ${params.entityId},
      ${params.reason},
      NOW()
    )
  `);
}
