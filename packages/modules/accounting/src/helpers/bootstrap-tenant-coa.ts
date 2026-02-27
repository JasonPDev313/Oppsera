import { eq, sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import {
  glAccounts,
  glClassifications,
  glAccountTemplates,
  glClassificationTemplates,
  accountingSettings,
} from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import { applyStatePlaceholders } from '../services/state-placeholder';

export async function bootstrapTenantCoa(
  tx: Database,
  tenantId: string,
  templateKey: string,
  stateName?: string,
): Promise<{ accountCount: number; classificationCount: number }> {
  // Idempotency: check if this tenant already has a COMPLETE bootstrap
  // (both settings AND accounts). If settings exist but accounts are missing
  // (e.g. from a partial prior run), we proceed with account creation.
  const existingSettings = await tx
    .select({ tenantId: accountingSettings.tenantId })
    .from(accountingSettings)
    .where(eq(accountingSettings.tenantId, tenantId))
    .limit(1);

  if (existingSettings.length > 0) {
    const existingAccounts = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, tenantId));

    // Only short-circuit if accounts actually exist — a settings row
    // without accounts means a prior run was incomplete.
    if (existingAccounts.length > 0) {
      const existingClassifications = await tx
        .select({ id: glClassifications.id })
        .from(glClassifications)
        .where(eq(glClassifications.tenantId, tenantId));
      return {
        accountCount: existingAccounts.length,
        classificationCount: existingClassifications.length,
      };
    }
    // Settings exist but no accounts — delete the orphaned settings row
    // so the bootstrap can proceed cleanly (settings are re-created in step 5).
    await tx
      .delete(accountingSettings)
      .where(eq(accountingSettings.tenantId, tenantId));
  }

  // 1. Load classification templates (shared across business types)
  const classificationTemplates = await tx
    .select()
    .from(glClassificationTemplates)
    .where(eq(glClassificationTemplates.templateKey, 'shared'));

  // 2. Insert classifications (ON CONFLICT skip — safe for retries after partial failure)
  const classificationMap = new Map<string, string>(); // name → id
  for (const ct of classificationTemplates) {
    const id = generateUlid();
    const result = await tx.execute(
      sql`INSERT INTO gl_classifications (id, tenant_id, name, account_type, sort_order, created_at, updated_at)
          VALUES (${id}, ${tenantId}, ${ct.name}, ${ct.accountType}, ${ct.sortOrder}, NOW(), NOW())
          ON CONFLICT (tenant_id, name) DO UPDATE SET id = gl_classifications.id
          RETURNING id`,
    );
    const row = Array.from(result as Iterable<{ id: string }>)[0];
    classificationMap.set(ct.name, row!.id);
  }

  // 3. Load account templates for the requested business type
  const accountTemplates = await tx
    .select()
    .from(glAccountTemplates)
    .where(eq(glAccountTemplates.templateKey, templateKey));

  if (accountTemplates.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      `No account templates found for key: ${templateKey}. Have all migrations been run? (pnpm db:migrate)`,
      400,
    );
  }

  // 3b. Apply state name to placeholders if provided
  const resolvedTemplates = stateName
    ? applyStatePlaceholders(accountTemplates, stateName)
    : accountTemplates;

  // 4. Insert accounts (ON CONFLICT skip — safe for retries after partial failure)
  const controlAccountIds: Record<string, string> = {};

  for (const at of resolvedTemplates) {
    const id = generateUlid();
    const classificationId = classificationMap.get(at.classificationName) ?? null;

    const result = await tx.execute(
      sql`INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, control_account_type, allow_manual_posting, created_at, updated_at)
          VALUES (${id}, ${tenantId}, ${at.accountNumber}, ${at.name}, ${at.accountType}, ${at.normalBalance}, ${classificationId}, true, ${at.isControlAccount ?? false}, ${at.controlAccountType ?? null}, true, NOW(), NOW())
          ON CONFLICT (tenant_id, account_number) DO UPDATE SET id = gl_accounts.id
          RETURNING id, control_account_type`,
    );
    const row = Array.from(result as Iterable<{ id: string; control_account_type: string | null }>)[0];
    const accountId = row!.id;

    if (row!.control_account_type) {
      controlAccountIds[row!.control_account_type] = accountId;
    }

    // Track special accounts by number
    if (at.accountNumber === '3000') {
      controlAccountIds['retained_earnings'] = accountId;
    }
    if (at.accountNumber === '9999') {
      controlAccountIds['rounding'] = accountId;
    }
    if (at.accountNumber === '2160') {
      controlAccountIds['tips_payable'] = accountId;
    }
    if (at.accountNumber === '4500') {
      controlAccountIds['service_charge_revenue'] = accountId;
    }
    if (at.accountNumber === '49900') {
      controlAccountIds['uncategorized_revenue'] = accountId;
    }
    if (at.accountNumber === '4510') {
      controlAccountIds['surcharge_revenue'] = accountId;
    }
    if (at.accountNumber === '1150') {
      controlAccountIds['ach_receivable'] = accountId;
    }
    if (at.accountNumber === '4100') {
      controlAccountIds['default_discount'] = accountId;
    }
    if (at.accountNumber === '6153') {
      controlAccountIds['price_override_expense'] = accountId;
    }
  }

  // 5. Create accounting_settings with sensible defaults
  // Base columns from migration 0075 — always safe to insert
  // ON CONFLICT skip — safe for retries
  await tx.execute(
    sql`INSERT INTO accounting_settings (tenant_id, base_currency, fiscal_year_start_month, auto_post_mode, default_ap_control_account_id, default_ar_control_account_id, default_sales_tax_payable_account_id, default_undeposited_funds_account_id, default_retained_earnings_account_id, default_rounding_account_id, rounding_tolerance_cents)
        VALUES (${tenantId}, 'USD', 1, 'auto_post', ${controlAccountIds['ap'] ?? null}, ${controlAccountIds['ar'] ?? null}, ${controlAccountIds['sales_tax'] ?? null}, ${controlAccountIds['undeposited_funds'] ?? null}, ${controlAccountIds['retained_earnings'] ?? null}, ${controlAccountIds['rounding'] ?? null}, 5)
        ON CONFLICT (tenant_id) DO NOTHING`,
  );

  // Extended columns from later migrations (0084, 0099, 0100, 0135, etc.)
  // If these columns don't exist yet, the UPDATE fails silently — bootstrap still succeeds
  const extendedDefaults: Record<string, string | null> = {};
  if (controlAccountIds['pms_guest_ledger']) extendedDefaults.defaultPmsGuestLedgerAccountId = controlAccountIds['pms_guest_ledger'];
  if (controlAccountIds['tips_payable']) extendedDefaults.defaultTipsPayableAccountId = controlAccountIds['tips_payable'];
  if (controlAccountIds['service_charge_revenue']) extendedDefaults.defaultServiceChargeRevenueAccountId = controlAccountIds['service_charge_revenue'];
  if (controlAccountIds['uncategorized_revenue']) extendedDefaults.defaultUncategorizedRevenueAccountId = controlAccountIds['uncategorized_revenue'];
  if (controlAccountIds['surcharge_revenue']) extendedDefaults.defaultSurchargeRevenueAccountId = controlAccountIds['surcharge_revenue'];
  if (controlAccountIds['ach_receivable']) extendedDefaults.defaultAchReceivableAccountId = controlAccountIds['ach_receivable'];
  if (controlAccountIds['default_discount']) extendedDefaults.defaultDiscountAccountId = controlAccountIds['default_discount'];
  if (controlAccountIds['price_override_expense']) extendedDefaults.defaultPriceOverrideExpenseAccountId = controlAccountIds['price_override_expense'];

  if (Object.keys(extendedDefaults).length > 0) {
    try {
      // Use SAVEPOINT so a column error doesn't abort the entire transaction
      await tx.execute(sql`SAVEPOINT extended_defaults`);
      await tx
        .update(accountingSettings)
        .set(extendedDefaults)
        .where(eq(accountingSettings.tenantId, tenantId));
    } catch {
      // Extended columns may not exist if later migrations haven't been run — roll back
      // to the savepoint so the transaction can continue
      await tx.execute(sql`ROLLBACK TO SAVEPOINT extended_defaults`);
    }
  }

  return {
    accountCount: resolvedTemplates.length,
    classificationCount: classificationTemplates.length,
  };
}
