import { eq, and, inArray, sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';
import { accountingSettings, glAccounts } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

/**
 * Well-known account numbers and the settings field they auto-wire to.
 * These match the patterns used in bootstrapTenantCoa.
 */
const ACCOUNT_WIRING: Array<{
  accountNumber: string;
  settingsField: keyof typeof accountingSettings;
}> = [
  { accountNumber: '49900', settingsField: 'defaultUncategorizedRevenueAccountId' },
  { accountNumber: '2160', settingsField: 'defaultTipsPayableAccountId' },
  { accountNumber: '4500', settingsField: 'defaultServiceChargeRevenueAccountId' },
  { accountNumber: '9999', settingsField: 'defaultRoundingAccountId' },
  { accountNumber: '3000', settingsField: 'defaultRetainedEarningsAccountId' },
  { accountNumber: '4510', settingsField: 'defaultSurchargeRevenueAccountId' },
  { accountNumber: '1150', settingsField: 'defaultAchReceivableAccountId' },
  { accountNumber: '4100', settingsField: 'defaultDiscountAccountId' },
  { accountNumber: '6153', settingsField: 'defaultPriceOverrideExpenseAccountId' },
  { accountNumber: '1100', settingsField: 'defaultARControlAccountId' },
  { accountNumber: '4110', settingsField: 'defaultReturnsAccountId' },
];

/**
 * The GL Suspense account is the ultimate catch-all. When no well-known accounts
 * exist (e.g., tenant imported a COA without standard account numbers), this
 * account is auto-created to guarantee the POS adapter can ALWAYS post GL entries.
 *
 * Account type is 'asset' with debit normal balance — works for both sides of
 * an unresolved GL entry. Accountant reviews and journals amounts out later.
 */
const SUSPENSE_ACCOUNT_NUMBER = '99999';
const SUSPENSE_ACCOUNT_NAME = 'GL Suspense – Unmapped Transactions';

/**
 * Ensure an accounting_settings row exists for a tenant, AND that a
 * fallback GL account is always available for posting.
 *
 * This is the safety net for tenants who set up GL mappings (via CSV import,
 * auto-map, or manual mapping) without running the Bootstrap Wizard.
 * Without a settings row + fallback accounts, GL posting is skipped entirely.
 *
 * Behavior:
 *   1. INSERT ... ON CONFLICT DO NOTHING — all columns have schema defaults
 *   2. Auto-wire well-known fallback accounts by matching account numbers
 *      (49900 = uncategorized revenue, 2160 = tips payable, etc.)
 *   3. Only updates settings fields that are currently NULL
 *   4. GUARANTEE: if defaultUncategorizedRevenueAccountId is still NULL after
 *      wiring, auto-create a "GL Suspense" account (99999) and wire it.
 *      This ensures the POS adapter can ALWAYS post — zero silent skips.
 *   5. GUARANTEE: if defaultUndepositedFundsAccountId is still NULL, wire the
 *      suspense account there too (catch-all for unmapped payment types).
 *
 * Idempotent: safe to call repeatedly.
 */
export async function ensureAccountingSettings(
  tx: Database,
  tenantId: string,
): Promise<{ created: boolean; autoWired: number }> {
  // 1. Create minimal settings row if missing (all defaults from schema)
  const insertResult = await tx.execute(
    sql`INSERT INTO accounting_settings (tenant_id)
        VALUES (${tenantId})
        ON CONFLICT (tenant_id) DO NOTHING`,
  );

  // postgres.js ON CONFLICT DO NOTHING returns count=0 if skipped
  const rowCount = (insertResult as unknown as { count: number }).count ?? 0;
  const created = rowCount > 0;

  // 2. Auto-wire well-known accounts by account number
  const knownNumbers = ACCOUNT_WIRING.map((w) => w.accountNumber);
  const accounts = await tx
    .select({
      id: glAccounts.id,
      accountNumber: glAccounts.accountNumber,
    })
    .from(glAccounts)
    .where(
      and(
        eq(glAccounts.tenantId, tenantId),
        inArray(glAccounts.accountNumber, knownNumbers),
        eq(glAccounts.isActive, true),
      ),
    );

  const numberToId = new Map(accounts.map((a) => [a.accountNumber, a.id]));

  // 3. Read current settings to only fill NULL fields
  const [current] = await tx
    .select()
    .from(accountingSettings)
    .where(eq(accountingSettings.tenantId, tenantId))
    .limit(1);

  if (!current) {
    return { created, autoWired: 0 };
  }

  const updates: Record<string, string> = {};

  for (const wiring of ACCOUNT_WIRING) {
    const accountId = numberToId.get(wiring.accountNumber);
    if (!accountId) continue;

    const currentValue = (current as Record<string, unknown>)[
      wiring.settingsField as string
    ];
    if (currentValue == null) {
      updates[wiring.settingsField as string] = accountId;
    }
  }

  // 4. GUARANTEE: ensure a fallback account exists for the POS adapter.
  //    If defaultUncategorizedRevenueAccountId is still NULL after wiring,
  //    auto-create the GL Suspense account as the ultimate catch-all.
  const uncatId =
    updates['defaultUncategorizedRevenueAccountId'] ??
    (current.defaultUncategorizedRevenueAccountId as string | null);

  const undepId =
    updates['defaultUndepositedFundsAccountId'] ??
    (current.defaultUndepositedFundsAccountId as string | null);

  const taxPayableId =
    updates['defaultSalesTaxPayableAccountId'] ??
    (current.defaultSalesTaxPayableAccountId as string | null);

  if (!uncatId || !undepId) {
    const suspenseId = await ensureSuspenseAccount(tx, tenantId);
    if (suspenseId) {
      if (!uncatId) {
        updates['defaultUncategorizedRevenueAccountId'] = suspenseId;
      }
      if (!undepId) {
        updates['defaultUndepositedFundsAccountId'] = suspenseId;
      }
      // Also wire tax payable fallback if missing
      if (!taxPayableId) {
        updates['defaultSalesTaxPayableAccountId'] = suspenseId;
      }
    }
  }

  const autoWired = Object.keys(updates).length;
  if (autoWired > 0) {
    await tx
      .update(accountingSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accountingSettings.tenantId, tenantId));
  }

  return { created, autoWired };
}

/**
 * Ensure the GL Suspense account (99999) exists for a tenant.
 * This is the ultimate catch-all — guarantees the POS adapter always has
 * somewhere to post, even with zero GL mappings configured.
 *
 * Returns the account ID (existing or newly created).
 */
async function ensureSuspenseAccount(
  tx: Database,
  tenantId: string,
): Promise<string | null> {
  // Check if it already exists
  const [existing] = await tx
    .select({ id: glAccounts.id })
    .from(glAccounts)
    .where(
      and(
        eq(glAccounts.tenantId, tenantId),
        eq(glAccounts.accountNumber, SUSPENSE_ACCOUNT_NUMBER),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  // Auto-create the suspense account
  try {
    const id = generateUlid();
    await tx.insert(glAccounts).values({
      id,
      tenantId,
      accountNumber: SUSPENSE_ACCOUNT_NUMBER,
      name: SUSPENSE_ACCOUNT_NAME,
      accountType: 'asset',
      normalBalance: 'debit',
      isActive: true,
      isControlAccount: false,
      allowManualPosting: true,
      description:
        'Auto-created catch-all account for unmapped GL transactions. ' +
        'Review and journal entries out to proper accounts.',
    });
    console.info(
      `[ensure-accounting] Auto-created GL Suspense account (${SUSPENSE_ACCOUNT_NUMBER}) for tenant=${tenantId}`,
    );
    return id;
  } catch {
    // ON CONFLICT or other DB error — try to read it (race condition)
    const [retryRow] = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.tenantId, tenantId),
          eq(glAccounts.accountNumber, SUSPENSE_ACCOUNT_NUMBER),
        ),
      )
      .limit(1);
    return retryRow?.id ?? null;
  }
}
