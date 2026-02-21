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
  roundingToleranceCents: number;
  enableCogsPosting: boolean;
  enableInventoryPosting: boolean;
  postByLocation: boolean;
  enableUndepositedFundsWorkflow: boolean;
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
    roundingToleranceCents: row.roundingToleranceCents,
    enableCogsPosting: row.enableCogsPosting,
    enableInventoryPosting: row.enableInventoryPosting,
    postByLocation: row.postByLocation,
    enableUndepositedFundsWorkflow: row.enableUndepositedFundsWorkflow,
  };
}
