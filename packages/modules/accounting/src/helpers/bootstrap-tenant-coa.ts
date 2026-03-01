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

  // 2. Bulk-insert classifications (single statement — ON CONFLICT safe for retries)
  const classificationMap = new Map<string, string>(); // name → id
  const classificationValues = classificationTemplates.map((ct) => ({
    id: generateUlid(),
    name: ct.name,
    accountType: ct.accountType,
    sortOrder: ct.sortOrder,
  }));

  if (classificationValues.length > 0) {
    const classRows = sql.join(
      classificationValues.map(
        (v) =>
          sql`(${v.id}, ${tenantId}, ${v.name}, ${v.accountType}, ${v.sortOrder}, NOW(), NOW())`,
      ),
      sql`,`,
    );
    const classResult = await tx.execute(
      sql`INSERT INTO gl_classifications (id, tenant_id, name, account_type, sort_order, created_at, updated_at)
          VALUES ${classRows}
          ON CONFLICT (tenant_id, name) DO UPDATE SET id = gl_classifications.id
          RETURNING id, name`,
    );
    for (const row of Array.from(classResult as Iterable<{ id: string; name: string }>)) {
      classificationMap.set(row.name, row.id);
    }
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

  // 4. Bulk-insert accounts (single statement — ON CONFLICT safe for retries)
  const controlAccountIds: Record<string, string> = {};

  // Map from account_number to well-known control key
  const ACCOUNT_NUMBER_KEYS: Record<string, string> = {
    '3000': 'retained_earnings',
    '9999': 'rounding',
    '2160': 'tips_payable',
    '4500': 'service_charge_revenue',
    '49900': 'uncategorized_revenue',
    '4510': 'surcharge_revenue',
    '1150': 'ach_receivable',
    '4100': 'default_discount',
    '6153': 'price_override_expense',
    '1160': 'credit_card_receivable',
    '2120': 'gift_card_liability',
    '6010': 'cc_processing_fee',
    '6030': 'bad_debt_expense',
    '4700': 'interest_income',
    '6140': 'interest_expense',
    '6040': 'delivery_commission',
    '1120': 'petty_cash',
    '2350': 'employee_reimbursable',
  };

  // Pre-generate IDs and build a lookup by account number
  const accountPrep = resolvedTemplates.map((at) => ({
    id: generateUlid(),
    template: at,
    classificationId: classificationMap.get(at.classificationName) ?? null,
  }));

  if (accountPrep.length > 0) {
    const accountRows = sql.join(
      accountPrep.map(
        (a) =>
          sql`(${a.id}, ${tenantId}, ${a.template.accountNumber}, ${a.template.name}, ${a.template.accountType}, ${a.template.normalBalance}, ${a.classificationId}, true, ${a.template.isControlAccount ?? false}, ${a.template.controlAccountType ?? null}, true, NOW(), NOW())`,
      ),
      sql`,`,
    );
    const acctResult = await tx.execute(
      sql`INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance, classification_id, is_active, is_control_account, control_account_type, allow_manual_posting, created_at, updated_at)
          VALUES ${accountRows}
          ON CONFLICT (tenant_id, account_number) DO UPDATE SET id = gl_accounts.id
          RETURNING id, account_number, control_account_type`,
    );

    for (const row of Array.from(
      acctResult as Iterable<{ id: string; account_number: string; control_account_type: string | null }>,
    )) {
      // Map control_account_type (e.g., 'ap', 'ar', 'sales_tax') → accountId
      if (row.control_account_type) {
        controlAccountIds[row.control_account_type] = row.id;
      }
      // Map well-known account numbers → named keys
      const key = ACCOUNT_NUMBER_KEYS[row.account_number];
      if (key) {
        controlAccountIds[key] = row.id;
      }
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
  // ── COA expansion (migration 0238) ──
  if (controlAccountIds['credit_card_receivable']) extendedDefaults.defaultCreditCardReceivableAccountId = controlAccountIds['credit_card_receivable'];
  if (controlAccountIds['gift_card_liability']) extendedDefaults.defaultGiftCardLiabilityAccountId = controlAccountIds['gift_card_liability'];
  if (controlAccountIds['cc_processing_fee']) extendedDefaults.defaultCcProcessingFeeAccountId = controlAccountIds['cc_processing_fee'];
  if (controlAccountIds['bad_debt_expense']) extendedDefaults.defaultBadDebtExpenseAccountId = controlAccountIds['bad_debt_expense'];
  if (controlAccountIds['interest_income']) extendedDefaults.defaultInterestIncomeAccountId = controlAccountIds['interest_income'];
  if (controlAccountIds['interest_expense']) extendedDefaults.defaultInterestExpenseAccountId = controlAccountIds['interest_expense'];
  if (controlAccountIds['delivery_commission']) extendedDefaults.defaultDeliveryCommissionAccountId = controlAccountIds['delivery_commission'];
  if (controlAccountIds['petty_cash']) extendedDefaults.defaultPettyCashAccountId = controlAccountIds['petty_cash'];
  if (controlAccountIds['employee_reimbursable']) extendedDefaults.defaultEmployeeReimbursableAccountId = controlAccountIds['employee_reimbursable'];

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
