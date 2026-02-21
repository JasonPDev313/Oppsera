import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export interface SubDeptGL {
  subDepartmentId: string;
  revenueAccountId: string;
  cogsAccountId: string | null;
  inventoryAccountId: string | null;
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
      inventory_asset_account_id
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
