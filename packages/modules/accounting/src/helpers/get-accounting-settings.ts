import { eq, sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { accountingSettings } from '@oppsera/db';

export interface AccountingSettings {
  tenantId: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  autoPostMode: string;
  lockPeriodThrough: string | null;
  defaultAPControlAccountId: string | null;
  defaultARControlAccountId: string | null;
  defaultSalesTaxPayableAccountId: string | null;
  defaultUndepositedFundsAccountId: string | null;
  defaultRetainedEarningsAccountId: string | null;
  defaultRoundingAccountId: string | null;
  defaultPmsGuestLedgerAccountId: string | null;
  roundingToleranceCents: number;
  enableCogsPosting: boolean;
  enableInventoryPosting: boolean;
  postByLocation: boolean;
  enableUndepositedFundsWorkflow: boolean;
  enableLegacyGlPosting: boolean;
  defaultTipsPayableAccountId: string | null;
  defaultServiceChargeRevenueAccountId: string | null;
  defaultCashOverShortAccountId: string | null;
  defaultCompExpenseAccountId: string | null;
  defaultReturnsAccountId: string | null;
  defaultPayrollClearingAccountId: string | null;
  defaultUncategorizedRevenueAccountId: string | null;
  cogsPostingMode: string; // 'disabled' | 'perpetual' | 'periodic'
  periodicCogsLastCalculatedDate: string | null;
  periodicCogsMethod: string | null;
  // Breakage income policy (migration 0120)
  recognizeBreakageAutomatically: boolean;
  breakageRecognitionMethod: string; // 'on_expiry' | 'proportional' | 'manual_only'
  breakageIncomeAccountId: string | null;
  voucherExpiryEnabled: boolean;
  // Auto-remap toggle (migration 0143)
  enableAutoRemap: boolean;
  // Surcharge revenue GL account (migration 0184)
  defaultSurchargeRevenueAccountId: string | null;
  // ACH Receivable account (migration 0178)
  defaultAchReceivableAccountId: string | null;
  // Discount classification GL defaults (migration 0212)
  defaultDiscountAccountId: string | null;
  defaultPriceOverrideExpenseAccountId: string | null;
  // COA expansion (migration 0238)
  defaultCreditCardReceivableAccountId: string | null;
  defaultGiftCardLiabilityAccountId: string | null;
  defaultCcProcessingFeeAccountId: string | null;
  defaultBadDebtExpenseAccountId: string | null;
  defaultInterestIncomeAccountId: string | null;
  defaultInterestExpenseAccountId: string | null;
  defaultDeliveryCommissionAccountId: string | null;
  defaultPettyCashAccountId: string | null;
  defaultEmployeeReimbursableAccountId: string | null;
  // Auto-close orchestrator (migration 0187)
  autoCloseEnabled: boolean;
  autoCloseTime: string; // HH:MM
  autoCloseSkipHolidays: boolean;
  // Day-end close (migration 0189)
  dayEndCloseEnabled: boolean;
  dayEndCloseTime: string; // HH:MM
  supportedCurrencies: string[];
  // Strict period close (migration 0285)
  strictPeriodClose: boolean;
}

/**
 * Fetch accounting settings for a tenant.
 * Returns null if no settings row exists.
 * Used by many commands and queries that need tenant GL configuration.
 *
 * Falls back to raw SQL if Drizzle SELECT * fails due to schema/migration
 * mismatch (e.g., new columns in Drizzle schema that don't exist in the DB yet).
 */
export async function getAccountingSettings(
  tx: Database,
  tenantId: string,
): Promise<AccountingSettings | null> {
  try {
    // NOTE: No SAVEPOINT here. The previous SAVEPOINT guard caused production
    // outages (#25P01) when callers passed bare `db` instead of a transaction
    // (e.g., pos-posting-adapter, try-auto-remap). Supavisor transaction-mode
    // pooler rejects SAVEPOINT outside BEGIN...COMMIT blocks, and the resulting
    // errors exhausted the pool → tripped the circuit breaker → cascading 500s.
    //
    // If the Drizzle query fails due to a missing column (schema mismatch during
    // deployment), the raw SQL fallback handles it. Inside a transaction, the
    // failed query aborts the tx — but schema mismatches only occur during the
    // brief window between code deploy and migration apply, which is acceptable.
    const [row] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, tenantId))
      .limit(1);

    if (!row) {
      return null;
    }

    return mapRow(row);
  } catch (err) {
    const msg = String((err as Error)?.message ?? '').toLowerCase();
    if (msg.includes('column') && msg.includes('does not exist')) {
      // Schema mismatch — Drizzle schema has columns the DB doesn't.
      // Fall back to raw SQL which only reads columns that actually exist.
      // Outside a transaction this works cleanly. Inside a transaction the
      // tx is already aborted, so this will also fail — acceptable since
      // schema mismatches are transient deployment artifacts.
      return getAccountingSettingsRaw(tx, tenantId);
    }
    throw err;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(row: any): AccountingSettings {
  return {
    tenantId: row.tenantId ?? row.tenant_id,
    baseCurrency: row.baseCurrency ?? row.base_currency ?? 'USD',
    fiscalYearStartMonth: Number(row.fiscalYearStartMonth ?? row.fiscal_year_start_month ?? 1),
    autoPostMode: row.autoPostMode ?? row.auto_post_mode ?? 'auto',
    lockPeriodThrough: row.lockPeriodThrough ?? row.lock_period_through ?? null,
    defaultAPControlAccountId: row.defaultAPControlAccountId ?? row.default_ap_control_account_id ?? null,
    defaultARControlAccountId: row.defaultARControlAccountId ?? row.default_ar_control_account_id ?? null,
    defaultSalesTaxPayableAccountId: row.defaultSalesTaxPayableAccountId ?? row.default_sales_tax_payable_account_id ?? null,
    defaultUndepositedFundsAccountId: row.defaultUndepositedFundsAccountId ?? row.default_undeposited_funds_account_id ?? null,
    defaultRetainedEarningsAccountId: row.defaultRetainedEarningsAccountId ?? row.default_retained_earnings_account_id ?? null,
    defaultRoundingAccountId: row.defaultRoundingAccountId ?? row.default_rounding_account_id ?? null,
    defaultPmsGuestLedgerAccountId: row.defaultPmsGuestLedgerAccountId ?? row.default_pms_guest_ledger_account_id ?? null,
    roundingToleranceCents: Number(row.roundingToleranceCents ?? row.rounding_tolerance_cents ?? 5),
    enableCogsPosting: row.enableCogsPosting ?? row.enable_cogs_posting ?? false,
    enableInventoryPosting: row.enableInventoryPosting ?? row.enable_inventory_posting ?? false,
    postByLocation: row.postByLocation ?? row.post_by_location ?? false,
    enableUndepositedFundsWorkflow: row.enableUndepositedFundsWorkflow ?? row.enable_undeposited_funds_workflow ?? false,
    enableLegacyGlPosting: row.enableLegacyGlPosting ?? row.enable_legacy_gl_posting ?? false,
    defaultTipsPayableAccountId: row.defaultTipsPayableAccountId ?? row.default_tips_payable_account_id ?? null,
    defaultServiceChargeRevenueAccountId: row.defaultServiceChargeRevenueAccountId ?? row.default_service_charge_revenue_account_id ?? null,
    defaultCashOverShortAccountId: row.defaultCashOverShortAccountId ?? row.default_cash_over_short_account_id ?? null,
    defaultCompExpenseAccountId: row.defaultCompExpenseAccountId ?? row.default_comp_expense_account_id ?? null,
    defaultReturnsAccountId: row.defaultReturnsAccountId ?? row.default_returns_account_id ?? null,
    defaultPayrollClearingAccountId: row.defaultPayrollClearingAccountId ?? row.default_payroll_clearing_account_id ?? null,
    defaultUncategorizedRevenueAccountId: row.defaultUncategorizedRevenueAccountId ?? row.default_uncategorized_revenue_account_id ?? null,
    cogsPostingMode: row.cogsPostingMode ?? row.cogs_posting_mode ?? 'disabled',
    periodicCogsLastCalculatedDate: row.periodicCogsLastCalculatedDate ?? row.periodic_cogs_last_calculated_date ?? null,
    periodicCogsMethod: row.periodicCogsMethod ?? row.periodic_cogs_method ?? null,
    recognizeBreakageAutomatically: row.recognizeBreakageAutomatically ?? row.recognize_breakage_automatically ?? false,
    breakageRecognitionMethod: row.breakageRecognitionMethod ?? row.breakage_recognition_method ?? 'on_expiry',
    breakageIncomeAccountId: row.breakageIncomeAccountId ?? row.breakage_income_account_id ?? null,
    voucherExpiryEnabled: row.voucherExpiryEnabled ?? row.voucher_expiry_enabled ?? false,
    enableAutoRemap: row.enableAutoRemap ?? row.enable_auto_remap ?? false,
    defaultSurchargeRevenueAccountId: row.defaultSurchargeRevenueAccountId ?? row.default_surcharge_revenue_account_id ?? null,
    defaultAchReceivableAccountId: row.defaultAchReceivableAccountId ?? row.default_ach_receivable_account_id ?? null,
    defaultDiscountAccountId: row.defaultDiscountAccountId ?? row.default_discount_account_id ?? null,
    defaultPriceOverrideExpenseAccountId: row.defaultPriceOverrideExpenseAccountId ?? row.default_price_override_expense_account_id ?? null,
    defaultCreditCardReceivableAccountId: row.defaultCreditCardReceivableAccountId ?? row.default_credit_card_receivable_account_id ?? null,
    defaultGiftCardLiabilityAccountId: row.defaultGiftCardLiabilityAccountId ?? row.default_gift_card_liability_account_id ?? null,
    defaultCcProcessingFeeAccountId: row.defaultCcProcessingFeeAccountId ?? row.default_cc_processing_fee_account_id ?? null,
    defaultBadDebtExpenseAccountId: row.defaultBadDebtExpenseAccountId ?? row.default_bad_debt_expense_account_id ?? null,
    defaultInterestIncomeAccountId: row.defaultInterestIncomeAccountId ?? row.default_interest_income_account_id ?? null,
    defaultInterestExpenseAccountId: row.defaultInterestExpenseAccountId ?? row.default_interest_expense_account_id ?? null,
    defaultDeliveryCommissionAccountId: row.defaultDeliveryCommissionAccountId ?? row.default_delivery_commission_account_id ?? null,
    defaultPettyCashAccountId: row.defaultPettyCashAccountId ?? row.default_petty_cash_account_id ?? null,
    defaultEmployeeReimbursableAccountId: row.defaultEmployeeReimbursableAccountId ?? row.default_employee_reimbursable_account_id ?? null,
    autoCloseEnabled: row.autoCloseEnabled ?? row.auto_close_enabled ?? false,
    autoCloseTime: row.autoCloseTime ?? row.auto_close_time ?? '02:00',
    autoCloseSkipHolidays: row.autoCloseSkipHolidays ?? row.auto_close_skip_holidays ?? false,
    dayEndCloseEnabled: row.dayEndCloseEnabled ?? row.day_end_close_enabled ?? false,
    dayEndCloseTime: row.dayEndCloseTime ?? row.day_end_close_time ?? '23:00',
    supportedCurrencies: row.supportedCurrencies ?? row.supported_currencies ?? ['USD'],
    strictPeriodClose: row.strictPeriodClose ?? row.strict_period_close ?? false,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Raw SQL fallback for getAccountingSettings.
 * Only selects columns guaranteed to exist (pre-migration 0238).
 * New columns from 0238+ default to null/false.
 */
async function getAccountingSettingsRaw(
  tx: Database,
  tenantId: string,
): Promise<AccountingSettings | null> {
  const result = await tx.execute(sql`SELECT * FROM accounting_settings WHERE tenant_id = ${tenantId} LIMIT 1`);
  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) return null;
  return mapRow(rows[0]);
}

/**
 * Lightweight bootstrap status check using raw SQL.
 * Unlike getAccountingSettings (which does SELECT * via Drizzle ORM and fails
 * if any Drizzle-schema column doesn't exist in the DB), this only checks
 * whether a settings row + at least one GL account exist for the tenant.
 * This survives schema mismatches from un-applied migrations.
 *
 * If the accounting tables don't exist yet (pre-migration 0075), returns
 * { bootstrapped: false, accountCount: 0 } instead of throwing.
 */
export async function isAccountingBootstrapped(
  tx: Database,
  tenantId: string,
): Promise<{ bootstrapped: boolean; accountCount: number }> {
  try {
    const result = await tx.execute(
      sql`SELECT
            (SELECT COUNT(*)::int FROM accounting_settings WHERE tenant_id = ${tenantId}) AS settings_count,
            (SELECT COUNT(*)::int FROM gl_accounts WHERE tenant_id = ${tenantId}) AS account_count`,
    );
    const row = Array.from(result as Iterable<{ settings_count: number | string; account_count: number | string }>)[0];
    // postgres.js may return numeric strings — coerce with Number()
    const settingsCount = Number(row?.settings_count ?? 0);
    const accountCount = Number(row?.account_count ?? 0);
    return {
      bootstrapped: settingsCount > 0 && accountCount > 0,
      accountCount,
    };
  } catch (err) {
    // If accounting tables don't exist yet (migration 0075 not applied),
    // the query fails with "relation does not exist". Treat as not bootstrapped.
    const msg = String((err as Error)?.message ?? '').toLowerCase();
    if (msg.includes('relation') && msg.includes('does not exist')) {
      return { bootstrapped: false, accountCount: 0 };
    }
    throw err;
  }
}
