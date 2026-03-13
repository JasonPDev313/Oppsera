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
  // ── COA expansion (migration 0238) ──
  { accountNumber: '1160', settingsField: 'defaultCreditCardReceivableAccountId' },
  { accountNumber: '2120', settingsField: 'defaultGiftCardLiabilityAccountId' },
  { accountNumber: '6010', settingsField: 'defaultCcProcessingFeeAccountId' },
  { accountNumber: '6030', settingsField: 'defaultBadDebtExpenseAccountId' },
  { accountNumber: '4700', settingsField: 'defaultInterestIncomeAccountId' },
  { accountNumber: '6140', settingsField: 'defaultInterestExpenseAccountId' },
  { accountNumber: '6040', settingsField: 'defaultDeliveryCommissionAccountId' },
  { accountNumber: '1120', settingsField: 'defaultPettyCashAccountId' },
  { accountNumber: '2350', settingsField: 'defaultEmployeeReimbursableAccountId' },
];

/**
 * Class-specific suspense accounts. Each account class gets its own suspense
 * account so that fallback postings never cross account classes (e.g., a
 * revenue fallback never lands in an expense account).
 *
 * Critical control-account mappings (tax payable, gift card liability, AR control,
 * bank/cash) are NOT auto-wired to suspense — they fail loud so the tenant must
 * configure them explicitly. Adapters log to gl_unmapped_events and skip.
 */
const SUSPENSE_ACCOUNTS = [
  { number: '99991', name: 'GL Suspense – Asset', type: 'asset' as const, normalBalance: 'debit' as const },
  { number: '99992', name: 'GL Suspense – Liability', type: 'liability' as const, normalBalance: 'credit' as const },
  { number: '99993', name: 'GL Suspense – Revenue', type: 'revenue' as const, normalBalance: 'credit' as const },
  { number: '99999', name: 'GL Suspense – Expense', type: 'expense' as const, normalBalance: 'debit' as const },
] as const;

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
  // Guard: reject empty/missing tenantId — would create a phantom settings row
  // and break RLS isolation (every query with tenant_id = '' matches it).
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new Error('[ensureAccountingSettings] tenantId is missing or empty');
  }

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

  // NOTE: defaultSalesTaxPayableAccountId is intentionally NOT checked here.
  // Tax liability must be explicitly mapped by the tenant — never auto-wired to suspense.

  const roundingId =
    updates['defaultRoundingAccountId'] ??
    (current.defaultRoundingAccountId as string | null);

  if (!uncatId || !undepId || !roundingId) {
    // Create class-specific suspense accounts and wire to correct classes.
    // Critical mappings (tax payable, gift card liability, AR control) are
    // intentionally NOT auto-wired — they fail loud so the tenant must configure them.
    const suspenseMap = await ensureSuspenseAccounts(tx, tenantId);

    if (suspenseMap) {
      // Revenue class → revenue suspense
      if (!uncatId && suspenseMap.revenue) {
        updates['defaultUncategorizedRevenueAccountId'] = suspenseMap.revenue;
      }
      // Asset class → asset suspense (undeposited funds is an asset)
      if (!undepId && suspenseMap.asset) {
        updates['defaultUndepositedFundsAccountId'] = suspenseMap.asset;
      }
      // Expense class → expense suspense (rounding adjustments)
      if (!roundingId && suspenseMap.expense) {
        updates['defaultRoundingAccountId'] = suspenseMap.expense;
      }
      // NOTE: taxPayableId is NOT auto-wired to suspense — fail loud.
      // Tax liability must be explicitly mapped by the tenant.
    }
  }

  const autoWired = Object.keys(updates).length;
  if (autoWired > 0) {
    await tx
      .update(accountingSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(accountingSettings.tenantId, tenantId));
  }

  // 5. Auto-provision standard payment type GL defaults if missing.
  //    Uses defaultUndepositedFundsAccountId as the deposit target — accountant
  //    can reclassify later, but this eliminates "Missing GL mapping: payment_type:*"
  //    noise in gl_unmapped_events for every tender.
  const depositAccountId = updates['defaultUndepositedFundsAccountId'] ?? undepId;
  if (depositAccountId) {
    // Pass the merged settings (current + updates) so ensureDefaultPaymentTypeMappings
    // doesn't need to re-query accounting_settings — saves a round-trip per call.
    const mergedSettings = { ...(current as Record<string, unknown>), ...updates };
    await ensureDefaultPaymentTypeMappings(tx, tenantId, depositAccountId, mergedSettings);
  }

  return { created, autoWired };
}

/**
 * Standard payment types that should always have a GL mapping.
 * ON CONFLICT DO NOTHING — safe for retries, won't overwrite tenant customizations.
 */
const STANDARD_PAYMENT_TYPES = ['cash', 'card', 'check', 'ecom', 'ach'];

/**
 * Payment types that should map to a specific account class when available,
 * falling back to the generic deposit account otherwise.
 */
const CLASS_SPECIFIC_PAYMENT_TYPES: Array<{
  paymentType: string;
  settingsField: string; // accounting_settings column for the preferred account
}> = [
  { paymentType: 'house_account', settingsField: 'defaultARControlAccountId' },
];

async function ensureDefaultPaymentTypeMappings(
  tx: Database,
  tenantId: string,
  depositAccountId: string,
  mergedSettings: Record<string, unknown>,
): Promise<void> {
  try {
    // Build all payment type rows in a single batch — standard types use the
    // deposit account, class-specific types use their preferred account if set.
    const allRows: Array<{ paymentType: string; accountId: string }> = [];

    for (const pt of STANDARD_PAYMENT_TYPES) {
      allRows.push({ paymentType: pt, accountId: depositAccountId });
    }

    for (const spec of CLASS_SPECIFIC_PAYMENT_TYPES) {
      const preferredAccountId = mergedSettings[spec.settingsField] as string | null;
      allRows.push({
        paymentType: spec.paymentType,
        accountId: preferredAccountId ?? depositAccountId,
      });
    }

    if (allRows.length === 0) return;

    // Single batch INSERT — eliminates N+1 sequential queries for class-specific types
    const values = allRows
      .map((r) => sql`(${tenantId}, ${r.paymentType}, ${r.accountId}, NOW(), NOW())`)
      .reduce((a, b) => sql`${a}, ${b}`);
    await tx.execute(sql`
      INSERT INTO payment_type_gl_defaults (tenant_id, payment_type_id, cash_account_id, created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (tenant_id, payment_type_id) DO NOTHING
    `);
  } catch (err) {
    // Never block — payment type mappings are non-critical fallbacks.
    // Log so silent failures are visible in production logs.
    console.warn(`[ensure-settings] ensureDefaultPaymentTypeMappings failed for tenant=${tenantId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Ensure class-specific GL Suspense accounts exist for a tenant.
 * Returns a map of account class → account ID.
 *
 * Each suspense account matches its natural class so fallback postings
 * never cross account boundaries. The old single-account 99999 is
 * retained as the expense suspense for backwards compatibility.
 */
async function ensureSuspenseAccounts(
  tx: Database,
  tenantId: string,
): Promise<Record<string, string> | null> {
  const suspenseNumbers = SUSPENSE_ACCOUNTS.map((s) => s.number);

  // Check which already exist
  const existing = await tx
    .select({
      id: glAccounts.id,
      accountNumber: glAccounts.accountNumber,
      accountType: glAccounts.accountType,
    })
    .from(glAccounts)
    .where(
      and(
        eq(glAccounts.tenantId, tenantId),
        inArray(glAccounts.accountNumber, suspenseNumbers),
      ),
    );

  const numberToId = new Map(existing.map((a) => [a.accountNumber, a.id]));
  const numberToType = new Map(existing.map((a) => [a.accountNumber, a.accountType]));

  // Fix legacy 99999 accounts created as 'asset' type
  const legacyId = numberToId.get('99999');
  if (legacyId && numberToType.get('99999') === 'asset') {
    try {
      await tx.execute(sql`
        UPDATE gl_accounts
        SET account_type = 'expense', updated_at = NOW()
        WHERE id = ${legacyId} AND account_type = 'asset'
      `);
    } catch { /* non-critical */ }
  }

  // Create any missing suspense accounts
  for (const spec of SUSPENSE_ACCOUNTS) {
    if (numberToId.has(spec.number)) continue;

    try {
      const id = generateUlid();
      await tx.insert(glAccounts).values({
        id,
        tenantId,
        accountNumber: spec.number,
        name: spec.name,
        accountType: spec.type,
        normalBalance: spec.normalBalance,
        isActive: true,
        isControlAccount: false,
        allowManualPosting: true,
        description:
          `Auto-created ${spec.type} suspense account for unmapped GL transactions. ` +
          'Review and journal entries out to proper accounts.',
      });
      numberToId.set(spec.number, id);
      console.info(
        `[ensure-accounting] Auto-created ${spec.name} (${spec.number}) for tenant=${tenantId}`,
      );
    } catch {
      // ON CONFLICT or race condition — try to read it.
      // Guard the retry read: if the DB is genuinely down, don't let a
      // failed SELECT propagate and kill the entire ensure flow. The
      // suspense account may exist (race condition) or not — either way,
      // partial creation is better than total failure.
      try {
        const [retryRow] = await tx
          .select({ id: glAccounts.id })
          .from(glAccounts)
          .where(
            and(
              eq(glAccounts.tenantId, tenantId),
              eq(glAccounts.accountNumber, spec.number),
            ),
          )
          .limit(1);
        if (retryRow) numberToId.set(spec.number, retryRow.id);
      } catch {
        // Both insert and read failed — skip this suspense account.
        // The adapter will fall back to uncategorized or skip with logging.
        console.warn(`[ensure-accounting] Failed to create/read suspense ${spec.number} for tenant=${tenantId}`);
      }
    }
  }

  // Build class → ID map
  const result: Record<string, string> = {};
  for (const spec of SUSPENSE_ACCOUNTS) {
    const id = numberToId.get(spec.number);
    if (id) result[spec.type] = id;
  }

  return Object.keys(result).length > 0 ? result : null;
}
