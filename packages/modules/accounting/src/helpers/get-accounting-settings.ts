import { eq } from 'drizzle-orm';
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
  cogsPostingMode: string; // 'disabled' | 'perpetual' | 'periodic'
  periodicCogsLastCalculatedDate: string | null;
  periodicCogsMethod: string | null;
  // Breakage income policy (migration 0120)
  recognizeBreakageAutomatically: boolean;
  breakageRecognitionMethod: string; // 'on_expiry' | 'proportional' | 'manual_only'
  breakageIncomeAccountId: string | null;
  voucherExpiryEnabled: boolean;
}

/**
 * Fetch accounting settings for a tenant.
 * Returns null if no settings row exists.
 * Used by many commands and queries that need tenant GL configuration.
 */
export async function getAccountingSettings(
  tx: Database,
  tenantId: string,
): Promise<AccountingSettings | null> {
  const [row] = await tx
    .select()
    .from(accountingSettings)
    .where(eq(accountingSettings.tenantId, tenantId))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    tenantId: row.tenantId,
    baseCurrency: row.baseCurrency,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    autoPostMode: row.autoPostMode,
    lockPeriodThrough: row.lockPeriodThrough,
    defaultAPControlAccountId: row.defaultAPControlAccountId,
    defaultARControlAccountId: row.defaultARControlAccountId,
    defaultSalesTaxPayableAccountId: row.defaultSalesTaxPayableAccountId,
    defaultUndepositedFundsAccountId: row.defaultUndepositedFundsAccountId,
    defaultRetainedEarningsAccountId: row.defaultRetainedEarningsAccountId,
    defaultRoundingAccountId: row.defaultRoundingAccountId,
    defaultPmsGuestLedgerAccountId: row.defaultPmsGuestLedgerAccountId ?? null,
    roundingToleranceCents: row.roundingToleranceCents,
    enableCogsPosting: row.enableCogsPosting,
    enableInventoryPosting: row.enableInventoryPosting,
    postByLocation: row.postByLocation,
    enableUndepositedFundsWorkflow: row.enableUndepositedFundsWorkflow,
    enableLegacyGlPosting: row.enableLegacyGlPosting,
    defaultTipsPayableAccountId: row.defaultTipsPayableAccountId ?? null,
    defaultServiceChargeRevenueAccountId: row.defaultServiceChargeRevenueAccountId ?? null,
    defaultCashOverShortAccountId: row.defaultCashOverShortAccountId ?? null,
    defaultCompExpenseAccountId: row.defaultCompExpenseAccountId ?? null,
    defaultReturnsAccountId: row.defaultReturnsAccountId ?? null,
    defaultPayrollClearingAccountId: row.defaultPayrollClearingAccountId ?? null,
    cogsPostingMode: row.cogsPostingMode,
    periodicCogsLastCalculatedDate: row.periodicCogsLastCalculatedDate ?? null,
    periodicCogsMethod: row.periodicCogsMethod ?? null,
    recognizeBreakageAutomatically: row.recognizeBreakageAutomatically,
    breakageRecognitionMethod: row.breakageRecognitionMethod,
    breakageIncomeAccountId: row.breakageIncomeAccountId ?? null,
    voucherExpiryEnabled: row.voucherExpiryEnabled,
  };
}
