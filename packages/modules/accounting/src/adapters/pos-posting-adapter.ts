import { db, isBreakerOpen } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { PermanentPostingError } from '@oppsera/shared';
import {
  resolvePaymentTypeAccounts,
  batchResolveSubDepartmentAccounts,
  batchResolveTaxGroupAccounts,
  batchResolveDiscountGlMappings,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { getDiscountClassificationDef } from '@oppsera/shared';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Circuit breaker skip tracking ────────────────────────────────
// When the breaker is open, GL postings are skipped and no unmapped events
// are logged (DB writes would amplify pool exhaustion). This counter tracks
// how many tenders were skipped so we can log a summary when the breaker
// closes and normal processing resumes.
let _breakerSkipCount = 0;
let _breakerSkipFirstAt: string | null = null;

interface PackageComponent {
  catalogItemId: string;
  catalogItemName: string;
  subDepartmentId: string | null;
  qty: number;
  componentUnitPriceCents: number;
  componentExtendedCents: number;
  allocatedRevenueCents: number;
  allocationWeight: number;
}

interface TenderRecordedPayload {
  tenderId: string;
  orderId: string;
  tenantId: string;
  locationId: string;
  tenderType?: string;
  paymentMethod?: string;
  amount: number; // cents
  tipAmount?: number; // cents (per-tender, not proportional)
  customerId?: string;
  terminalId?: string;
  tenderSequence?: number;
  isFullyPaid?: boolean;
  orderTotal?: number; // cents
  subtotal?: number; // cents (revenue before tax, before discount)
  taxTotal?: number; // cents
  discountTotal?: number; // cents
  serviceChargeTotal?: number; // cents
  totalTendered?: number; // cents (cumulative including this tender)
  lines?: Array<{
    catalogItemId: string;
    catalogItemName: string;
    subDepartmentId: string | null;
    qty: number;
    extendedPriceCents: number;
    taxGroupId: string | null;
    taxAmountCents: number;
    costCents: number | null;
    packageComponents: PackageComponent[] | null;
  }>;
  surchargeAmountCents?: number; // cents (per-tender surcharge)
  discountBreakdown?: Array<{
    classification: string; // 'manual_discount' | 'promo_code' | etc.
    amountCents: number;    // total cents for this classification
  }>;
  priceOverrideLossCents?: number; // sum of all price override losses
  businessDate: string;
}

interface GlLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  locationId?: string;
  customerId?: string;
  subDepartmentId?: string;
  terminalId?: string;
  channel?: string;
  discountClassification?: string;
  memo?: string;
}

/**
 * POS GL posting adapter — consumes tender.recorded.v1 events.
 *
 * Uses proportional allocation for split tenders:
 *   tenderRatio = tenderAmount / orderTotal
 * Each tender posts only its proportional share of revenue, tax, COGS,
 * discounts, and service charges. Tips are per-tender (not proportional).
 *
 * GL entry structure (balanced):
 *   DEBIT:  Cash/Deposit/Clearing = tenderAmount + tipAmount + surchargeAmount
 *   DEBIT:  Discount (contra-revenue by sub-department)
 *   CREDIT: Revenue = proportional share of line subtotals (by sub-department)
 *   CREDIT: Service Charge Revenue = proportional share of serviceChargeTotal
 *   CREDIT: Tax Payable = proportional share of taxTotal (by tax group)
 *   CREDIT: Surcharge Revenue = surchargeAmount (per-tender)
 *   CREDIT: Tips Payable = tipAmount
 *   DEBIT:  COGS = proportional share of cost (when enabled)
 *   CREDIT: Inventory = proportional share of cost (when enabled)
 *
 * FALLBACK CASCADE: When GL mappings are missing, the adapter uses tenant-level
 * fallback accounts instead of skipping. Revenue NEVER silently drops.
 *   - Missing payment type → defaultUndepositedFundsAccountId
 *   - Missing sub-department → defaultUncategorizedRevenueAccountId
 *   - Missing tax group → defaultSalesTaxPayableAccountId
 *   - Missing service charge account → defaultUncategorizedRevenueAccountId
 *   - Missing tips payable account → skipped + logged (liability class, no cross-class fallback)
 * Unmapped events are ALWAYS logged regardless of whether a fallback was used.
 *
 * NEVER blocks tenders — all failures are logged and swallowed.
 */
export async function handleTenderForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as TenderRecordedPayload;

  // ── Circuit breaker fast-exit ──────────────────────────────────
  // GL posting makes 5-10+ DB queries. When the breaker is open, every
  // one of those would fail individually, queueing up timeouts that
  // prevent recovery. Bail out immediately — the outbox will retry once
  // the breaker closes.
  if (isBreakerOpen()) {
    _breakerSkipCount++;
    if (!_breakerSkipFirstAt) _breakerSkipFirstAt = new Date().toISOString();
    console.warn(`[pos-gl] Skipped GL posting for tender ${data.tenderId}: circuit breaker open (skipped: ${_breakerSkipCount})`);
    return;
  }

  // ── Flush breaker skip summary ───────────────────────────────
  // First successful entry after breaker closes: log how many tenders were
  // skipped so the admin dashboard has post-incident visibility.
  if (_breakerSkipCount > 0) {
    const skipped = _breakerSkipCount;
    const since = _breakerSkipFirstAt;
    _breakerSkipCount = 0;
    _breakerSkipFirstAt = null;
    console.error(`[pos-gl] Circuit breaker recovered — ${skipped} GL posting(s) skipped since ${since}. Outbox worker will retry.`);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'tender.recorded.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.tenderId,
        entityType: 'breaker_skip_summary',
        entityId: tenantId,
        reason: `Circuit breaker was open — ${skipped} GL posting(s) skipped since ${since}. Outbox worker will retry missed events.`,
      });
    } catch { /* best-effort — breaker just recovered, pool may still be fragile */ }
  }

  try {
    await handleTenderForAccountingInner(event, tenantId, data);
  } catch (error) {
    console.error(`[pos-gl] GL posting failed for tender ${data.tenderId}:`, error);

    // Log to gl_unmapped_events for visibility (best-effort)
    if (!isBreakerOpen()) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'tender.recorded.v1',
          sourceModule: 'pos',
          sourceReferenceId: data.tenderId,
          entityType: error instanceof PermanentPostingError ? 'permanent_posting_error' : 'transient_posting_error',
          entityId: data.tenderId,
          reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } catch { /* best-effort — don't compound the failure */ }
    }

    // Permanent errors (missing mappings, unconfigured settings) will never
    // succeed on retry — swallow them so the outbox worker marks the event done.
    // Transient errors (DB timeout, connection failure, unexpected runtime error)
    // re-throw so the outbox worker unclaims the event for retry with backoff.
    if (error instanceof PermanentPostingError) {
      return; // logged above, no retry
    }
    throw error; // transient — let outbox retry
  }
}

async function handleTenderForAccountingInner(
  event: EventEnvelope,
  tenantId: string,
  data: TenderRecordedPayload,
): Promise<void> {
  // Check if accounting is enabled for this tenant — auto-create if missing,
  // or auto-wire critical fallback accounts if they're null.
  // Wrapped in try-catch: transient Supavisor/Drizzle errors (e.g., SAVEPOINT
  // outside transaction block) should not skip GL posting entirely — retry once,
  // then fall through to the ensureAccountingSettings path which has its own guard.
  let settings: Awaited<ReturnType<typeof getAccountingSettings>> = null;
  try {
    settings = await getAccountingSettings(db, tenantId);
  } catch (err) {
    console.warn(`[pos-gl] getAccountingSettings failed for tenant=${tenantId}, will retry via ensure path:`, err instanceof Error ? err.message : err);
    // Fall through — needsEnsure will be true, which calls ensureAccountingSettings
  }

  // Skip new GL posting when legacy GL is still active — the inline path in
  // record-tender already wrote to paymentJournalEntries. Running both would
  // create duplicate GL entries across the two ledgers.
  if (settings?.enableLegacyGlPosting) return;

  const needsEnsure = !settings
    || !settings.defaultRoundingAccountId
    || !settings.defaultUncategorizedRevenueAccountId
    || !settings.defaultUndepositedFundsAccountId;

  if (needsEnsure) {
    try {
      const { created, autoWired } = await ensureAccountingSettings(db, tenantId);
      if (created) {
        console.info(`[pos-gl] Auto-created accounting_settings for tenant=${tenantId}`);
      } else if (autoWired > 0) {
        console.info(`[pos-gl] Auto-wired ${autoWired} fallback account(s) for tenant=${tenantId}`);
      }
      settings = await getAccountingSettings(db, tenantId);
    } catch (ensureErr) {
      // Distinguish transient DB errors from permanent config errors.
      // If ensureAccountingSettings throws a DB/pool error, re-throw so
      // the outbox retries. Only treat "settings truly absent" as permanent.
      console.error(`[pos-gl] ensureAccountingSettings failed for tenant=${tenantId}:`, ensureErr instanceof Error ? ensureErr.message : ensureErr);
    }
    if (!settings) {
      // If settings is still null after ensure failed, check if it was a transient
      // error (DB timeout, pool exhaustion) vs permanent (no chart of accounts).
      // Re-throw without PermanentPostingError so the outbox retries.
      throw new Error(
        `GL posting deferred: accounting_settings unavailable for tenant=${tenantId}, tender=${data.tenderId} — will retry`,
      );
    }
  }

  // After ensure, settings is guaranteed non-null (either existed or was created)
  if (!settings) return;

  const accountingApi = getAccountingPostingApi();

  // Build a synthetic context for GL posting
  const ctx: RequestContext = {
    tenantId,
    locationId: data.locationId,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `pos-gl-${data.tenderId}`,
    isPlatformAdmin: false,
  } as RequestContext;

  // Compute proportional allocation ratio
  const orderTotal = data.orderTotal ?? data.amount; // fallback: single tender = full amount
  if (!orderTotal || orderTotal <= 0) {
    // Zero/negative-dollar orders (fully comped, etc.) — no money changed hands,
    // nothing to post. Log for visibility so admin can verify coverage.
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'tender.recorded.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.tenderId,
        entityType: 'zero_dollar_order',
        entityId: data.orderId,
        reason: `GL posting skipped: orderTotal=${orderTotal} (zero/negative-dollar order, tender=${data.tenderId})`,
      });
    } catch { /* never block tender */ }
    return;
  }
  const tenderRatio = data.amount / orderTotal;
  // Guard against NaN/Infinity from unexpected data (e.g., amount=0, orderTotal=NaN)
  if (!Number.isFinite(tenderRatio) || tenderRatio < 0) {
    console.error(`[pos-gl] Invalid tenderRatio=${tenderRatio} (amount=${data.amount}, orderTotal=${orderTotal}) for tender=${data.tenderId}`);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'tender.recorded.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.tenderId,
        entityType: 'invalid_ratio',
        entityId: data.tenderId,
        reason: `GL posting skipped: invalid tenderRatio=${tenderRatio} (amount=${data.amount}, orderTotal=${orderTotal})`,
      });
    } catch { /* never block tender */ }
    return;
  }

  const tipAmount = data.tipAmount ?? 0;
  const discountTotal = data.discountTotal ?? 0;
  const serviceChargeTotal = data.serviceChargeTotal ?? 0;

  const glLines: GlLine[] = [];
  const missingMappings: string[] = [];

  // ── 1. DEBIT: Payment received (tender amount + tip) ───────────
  // Resolve deposit account: specific mapping > default undeposited funds
  const paymentMethod = data.tenderType ?? data.paymentMethod ?? 'unknown';
  const paymentTypeMapping = await resolvePaymentTypeAccounts(db, tenantId, paymentMethod);

  // House accounts are direct receivables — never route through a clearing
  // account, even if enableUndepositedFundsWorkflow is on. The debit must
  // hit AR (1110) directly so the receivable is recognized immediately.
  const isHouseAccount = paymentMethod === 'house_account';

  let depositAccountId: string | null = null;
  if (paymentTypeMapping) {
    depositAccountId = (!isHouseAccount && settings.enableUndepositedFundsWorkflow && paymentTypeMapping.clearingAccountId)
      ? paymentTypeMapping.clearingAccountId
      : paymentTypeMapping.depositAccountId;
    // Secondary fallback: mapping row exists but account fields are null
    if (!depositAccountId) {
      depositAccountId = settings.defaultUndepositedFundsAccountId ?? null;
      missingMappings.push(`payment_type_incomplete:${paymentMethod}`);
    }
  } else {
    // No mapping at all: use default undeposited funds account
    depositAccountId = settings.defaultUndepositedFundsAccountId ?? null;
    missingMappings.push(`payment_type:${paymentMethod}`);
  }

  const surchargeAmount = data.surchargeAmountCents ?? 0;

  // Always include tips in the debit — cash was physically received.
  // If no tips payable account is configured, the reconciliation step (6b)
  // will balance the entry via the rounding account (ensureAccountingSettings
  // guarantees defaultRoundingAccountId is always set). The missing tips payable
  // account is logged as an unmapped event for the accountant to configure.
  const tipAccountId = settings.defaultTipsPayableAccountId ?? null;
  const includeTipInDebit = tipAmount > 0;

  if (depositAccountId) {
    const totalDebitCents = data.amount + (includeTipInDebit ? tipAmount : 0) + surchargeAmount;
    const tenderDollars = (totalDebitCents / 100).toFixed(2);
    glLines.push({
      accountId: depositAccountId,
      debitAmount: tenderDollars,
      creditAmount: '0',
      locationId: data.locationId,
      customerId: data.customerId,
      terminalId: data.terminalId,
      channel: 'pos',
      memo: paymentTypeMapping
        ? `POS tender ${paymentMethod}`
        : `POS tender ${paymentMethod} (fallback: undeposited funds)`,
    });
  }

  // ── 2. CREDIT: Revenue + Tax + COGS + Discounts + Svc Charges ──
  if (data.lines && data.lines.length > 0) {
    // Batch-fetch all GL mappings upfront (1 query each instead of N per loop).
    // Sequential: each uses the module-level `db` singleton (1 pool connection).
    // Running in parallel required 3 connections simultaneously, which with
    // Vercel pool max:2 causes deadlocks under any concurrent load.
    const subDeptMap = await batchResolveSubDepartmentAccounts(db, tenantId);
    const taxGroupMap = await batchResolveTaxGroupAccounts(db, tenantId);
    const discountGlMap = await batchResolveDiscountGlMappings(db, tenantId);

    // Group revenue by subDepartmentId (applying proportional ratio)
    const revenueBySubDept = new Map<string, number>();
    const cogsLines: Array<{ subDeptId: string; costCents: number }> = [];
    const taxByGroup = new Map<string, number>();

    // COGS: only post per-tender in perpetual mode (periodic/disabled skip)
    const shouldPostCogs = settings.cogsPostingMode === 'perpetual';

    for (const line of data.lines) {
      // Check if this is a package with enriched component allocations
      const hasEnrichedComponents = line.packageComponents
        && line.packageComponents.length > 0
        && line.packageComponents[0]?.allocatedRevenueCents != null;

      if (hasEnrichedComponents) {
        // Package item: split revenue across component subdepartments
        for (const comp of line.packageComponents!) {
          const compSubDeptId = comp.subDepartmentId ?? 'unmapped';
          const existing = revenueBySubDept.get(compSubDeptId) ?? 0;
          revenueBySubDept.set(compSubDeptId, existing + comp.allocatedRevenueCents * tenderRatio);
        }
      } else {
        // Regular item or legacy package: use line-level subdepartment
        const subDeptId = line.subDepartmentId ?? 'unmapped';
        const existing = revenueBySubDept.get(subDeptId) ?? 0;
        revenueBySubDept.set(subDeptId, existing + line.extendedPriceCents * tenderRatio);
      }

      if (line.costCents && shouldPostCogs) {
        const subDeptId = line.subDepartmentId ?? 'unmapped';
        cogsLines.push({ subDeptId, costCents: line.costCents * line.qty * tenderRatio });
      }

      if (line.taxGroupId && line.taxAmountCents) {
        const existingTax = taxByGroup.get(line.taxGroupId) ?? 0;
        taxByGroup.set(line.taxGroupId, existingTax + line.taxAmountCents * tenderRatio);
      }
    }

    // ── Revenue credits ──────────────────────────────────────────
    // Compute total revenue for discount distribution
    const totalRevenueCents = Array.from(revenueBySubDept.values()).reduce((sum, v) => sum + v, 0);

    for (const [subDeptId, amountCents] of revenueBySubDept) {
      let revenueAccountId: string | null = null;
      const subDeptMapping = subDeptId !== 'unmapped' ? (subDeptMap.get(subDeptId) ?? null) : null;

      if (subDeptMapping) {
        revenueAccountId = subDeptMapping.revenueAccountId;
      } else {
        // Fallback: uncategorized revenue account
        revenueAccountId = settings.defaultUncategorizedRevenueAccountId ?? null;
        missingMappings.push(`sub_department:${subDeptId}`);
      }

      const roundedCents = Math.round(amountCents);
      if (revenueAccountId && roundedCents > 0) {
        glLines.push({
          accountId: revenueAccountId,
          debitAmount: '0',
          creditAmount: (roundedCents / 100).toFixed(2),
          locationId: data.locationId,
          subDepartmentId: subDeptId !== 'unmapped' ? subDeptId : undefined,
          terminalId: data.terminalId,
          channel: 'pos',
          memo: subDeptMapping
            ? `Revenue - sub-dept ${subDeptId}`
            : `Revenue - unmapped (fallback: uncategorized)`,
        });
      } else if (revenueAccountId && roundedCents < 0) {
        // Negative revenue (credit/promotional lines) — post as a debit (reversal)
        glLines.push({
          accountId: revenueAccountId,
          debitAmount: (Math.abs(roundedCents) / 100).toFixed(2),
          creditAmount: '0',
          locationId: data.locationId,
          subDepartmentId: subDeptId !== 'unmapped' ? subDeptId : undefined,
          terminalId: data.terminalId,
          channel: 'pos',
          memo: subDeptMapping
            ? `Revenue reversal - sub-dept ${subDeptId}`
            : `Revenue reversal - unmapped (fallback: uncategorized)`,
        });
      } else if (!revenueAccountId && roundedCents !== 0) {
        // Should never happen after ensureAccountingSettings guarantees suspense
        missingMappings.push(`revenue_account_null:${subDeptId}`);
      }
    }

    // ── Discount debits (per-classification GL posting) ──────────
    // When discountBreakdown is available, post each classification to its
    // own GL account via the discount_gl_mappings table.
    // Fallback cascade: discount_gl_mappings → defaultDiscountAccountId → defaultUncategorizedRevenueAccountId.
    // When discountBreakdown is absent (old events), fall back to the legacy
    // single-account proportional distribution.
    if (data.discountBreakdown && data.discountBreakdown.length > 0) {
      for (const entry of data.discountBreakdown) {
        const classificationCents = Math.round(entry.amountCents * tenderRatio);
        if (classificationCents <= 0) continue;

        const def = getDiscountClassificationDef(entry.classification);

        // Resolve GL account: per-sub-dept classification mapping → tenant default → uncategorized
        // For order-level discounts we don't have a sub-department, so we check
        // each sub-department's mapping in case there's a tenant-wide default.
        // The primary lookup uses the first sub-department in the revenue map.
        let discountAccountId: string | null = null;
        let resolvedSubDeptId: string | undefined;

        // Try sub-department-specific mapping
        for (const [subDeptId] of revenueBySubDept) {
          if (subDeptId === 'unmapped') continue;
          const innerMap = discountGlMap.get(subDeptId);
          if (innerMap) {
            const mapped = innerMap.get(entry.classification);
            if (mapped) {
              discountAccountId = mapped;
              resolvedSubDeptId = subDeptId;
              break;
            }
          }
        }

        // Fallback: tenant-level default discount account
        if (!discountAccountId) {
          discountAccountId = settings.defaultDiscountAccountId
            ?? settings.defaultUncategorizedRevenueAccountId
            ?? null;
          missingMappings.push(`discount_classification:${entry.classification}`);
        }

        if (discountAccountId) {
          glLines.push({
            accountId: discountAccountId,
            debitAmount: (classificationCents / 100).toFixed(2),
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: resolvedSubDeptId,
            terminalId: data.terminalId,
            channel: 'pos',
            discountClassification: entry.classification,
            memo: `Discount (${def?.label ?? entry.classification})`,
          });
        }
      }
    } else if (discountTotal > 0 && totalRevenueCents > 0) {
      // Legacy fallback: old events without discountBreakdown —
      // distribute discountTotal proportionally across sub-departments
      for (const [subDeptId, amountCents] of revenueBySubDept) {
        const subDeptMapping = subDeptId !== 'unmapped' ? (subDeptMap.get(subDeptId) ?? null) : null;
        const subDeptDiscountShare = Math.round(
          discountTotal * tenderRatio * (amountCents / totalRevenueCents),
        );
        if (subDeptDiscountShare > 0) {
          const discountAccountId = subDeptMapping?.discountAccountId
            ?? settings.defaultDiscountAccountId
            ?? settings.defaultUncategorizedRevenueAccountId
            ?? null;
          if (!subDeptMapping?.discountAccountId) {
            missingMappings.push(`discount_account:${subDeptId}`);
          }
          if (discountAccountId) {
            glLines.push({
              accountId: discountAccountId,
              debitAmount: (subDeptDiscountShare / 100).toFixed(2),
              creditAmount: '0',
              locationId: data.locationId,
              subDepartmentId: subDeptId !== 'unmapped' ? subDeptId : undefined,
              terminalId: data.terminalId,
              channel: 'pos',
              memo: `Discount - sub-dept ${subDeptId} (legacy)`,
            });
          }
        }
      }
    }

    // ── Price override loss debit (expense account 6153) ──────
    // Tracks revenue lost from manual price reductions — currently invisible
    // because price overrides just reduce the unit price. This makes the loss
    // visible as a tracked expense in GL.
    if (data.priceOverrideLossCents && data.priceOverrideLossCents > 0) {
      const lossCents = Math.round(data.priceOverrideLossCents * tenderRatio);
      if (lossCents > 0) {
        const priceOverrideAccountId = settings.defaultPriceOverrideExpenseAccountId ?? null;
        const offsetAccountId = settings.defaultUncategorizedRevenueAccountId ?? null;

        // Both accounts must exist AND be distinct — posting debit/credit to the
        // same account creates a self-canceling entry that inflates account activity.
        if (priceOverrideAccountId && offsetAccountId && priceOverrideAccountId !== offsetAccountId) {
          // Price override loss is informational — it's ALREADY reflected in the
          // reduced revenue line (lower unit price). This entry is a memo-only
          // debit/credit pair to a price override tracking account for reporting.
          // We do NOT add a net debit here — the revenue credit is already lower.
          glLines.push({
            accountId: priceOverrideAccountId,
            debitAmount: (lossCents / 100).toFixed(2),
            creditAmount: '0',
            locationId: data.locationId,
            terminalId: data.terminalId,
            channel: 'pos',
            discountClassification: 'price_override',
            memo: 'Price override loss (tracking)',
          });
          // Offset credit to uncategorized revenue — keeps GL balanced
          glLines.push({
            accountId: offsetAccountId,
            debitAmount: '0',
            creditAmount: (lossCents / 100).toFixed(2),
            locationId: data.locationId,
            terminalId: data.terminalId,
            channel: 'pos',
            discountClassification: 'price_override',
            memo: 'Price override loss offset',
          });
        } else {
          // Skip both lines — either an account is missing or they'd be the same account
          missingMappings.push('price_override_expense_account:missing');
        }
      }
    }

    // COGS entries (debit COGS, credit Inventory) — proportional share
    if (shouldPostCogs) {
      const cogsBySubDept = new Map<string, number>();
      for (const c of cogsLines) {
        const existing = cogsBySubDept.get(c.subDeptId) ?? 0;
        cogsBySubDept.set(c.subDeptId, existing + c.costCents);
      }

      for (const [subDeptId, rawCostCents] of cogsBySubDept) {
        const subDeptMapping = subDeptMap.get(subDeptId);
        if (!subDeptMapping || !subDeptMapping.cogsAccountId || !subDeptMapping.inventoryAccountId) {
          // Log the skip — previously silent, making COGS gaps invisible to admins
          if (Math.round(rawCostCents) > 0) {
            const missing = !subDeptMapping ? 'cogs_mapping' : !subDeptMapping.cogsAccountId ? 'cogs_account' : 'inventory_account';
            missingMappings.push(`${missing}:${subDeptId}`);
          }
          continue;
        }

        const costCents = Math.round(rawCostCents);
        if (costCents > 0) {
          const costDollars = (costCents / 100).toFixed(2);
          glLines.push({
            accountId: subDeptMapping.cogsAccountId,
            debitAmount: costDollars,
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: subDeptId,
            terminalId: data.terminalId,
            channel: 'pos',
            memo: `COGS - sub-dept ${subDeptId}`,
          });
          glLines.push({
            accountId: subDeptMapping.inventoryAccountId,
            debitAmount: '0',
            creditAmount: costDollars,
            locationId: data.locationId,
            subDepartmentId: subDeptId,
            terminalId: data.terminalId,
            channel: 'pos',
            memo: `Inventory - sub-dept ${subDeptId}`,
          });
        }
      }
    }

    // Tax credits — proportional share (with fallback to default tax payable)
    for (const [taxGroupId, rawTaxCents] of taxByGroup) {
      let taxAccountId = taxGroupMap.get(taxGroupId) ?? null;

      if (!taxAccountId) {
        // Fallback: use tenant-level default sales tax payable
        taxAccountId = settings.defaultSalesTaxPayableAccountId ?? null;
        missingMappings.push(`tax_group:${taxGroupId}`);
      }

      const taxCents = Math.round(rawTaxCents);
      if (taxAccountId && taxCents > 0) {
        glLines.push({
          accountId: taxAccountId,
          debitAmount: '0',
          creditAmount: (taxCents / 100).toFixed(2),
          locationId: data.locationId,
          terminalId: data.terminalId,
          channel: 'pos',
          memo: `Sales tax - group ${taxGroupId}`,
        });
      } else if (!taxAccountId && taxCents > 0) {
        missingMappings.push(`tax_account_null:${taxGroupId}`);
      }
    }
  } else {
    // No line detail — post full tender amount to uncategorized revenue
    missingMappings.push('no_line_detail');
    const fallbackRevenueAccountId = settings.defaultUncategorizedRevenueAccountId ?? null;
    if (fallbackRevenueAccountId && data.amount > 0) {
      const revenueDollars = (data.amount / 100).toFixed(2);
      glLines.push({
        accountId: fallbackRevenueAccountId,
        debitAmount: '0',
        creditAmount: revenueDollars,
        locationId: data.locationId,
        terminalId: data.terminalId,
        channel: 'pos',
        memo: 'Revenue - no line detail (fallback: uncategorized)',
      });
    } else if (!fallbackRevenueAccountId && data.amount > 0) {
      missingMappings.push('revenue_fallback_null:uncategorized_account_missing');
    }
  }

  // ── 3. CREDIT: Service charge revenue (proportional share) ─────
  if (serviceChargeTotal > 0) {
    const svcChargeCents = Math.round(serviceChargeTotal * tenderRatio);
    const svcAccountId = settings.defaultServiceChargeRevenueAccountId
      ?? settings.defaultUncategorizedRevenueAccountId
      ?? null;
    if (svcChargeCents > 0 && svcAccountId) {
      glLines.push({
        accountId: svcAccountId,
        debitAmount: '0',
        creditAmount: (svcChargeCents / 100).toFixed(2),
        locationId: data.locationId,
        terminalId: data.terminalId,
        channel: 'pos',
        memo: settings.defaultServiceChargeRevenueAccountId
          ? 'Service charge revenue'
          : 'Service charge revenue (fallback: uncategorized)',
      });
      if (!settings.defaultServiceChargeRevenueAccountId) {
        missingMappings.push('service_charge_account:missing');
      }
    }
  }

  // ── 4. CREDIT: Surcharge revenue (per-tender, not proportional) ──
  // IMPORTANT: Fallback cascade must ONLY use revenue-type accounts.
  // Never add fallbacks to cash/asset/expense accounts here.
  if (surchargeAmount > 0) {
    const surchargeAccountId = settings.defaultSurchargeRevenueAccountId
      ?? settings.defaultUncategorizedRevenueAccountId
      ?? null;
    if (surchargeAccountId) {
      glLines.push({
        accountId: surchargeAccountId,
        debitAmount: '0',
        creditAmount: (surchargeAmount / 100).toFixed(2),
        locationId: data.locationId,
        terminalId: data.terminalId,
        channel: 'pos',
        memo: settings.defaultSurchargeRevenueAccountId
          ? 'Credit card surcharge revenue'
          : 'Credit card surcharge revenue (fallback: uncategorized)',
      });
      if (!settings.defaultSurchargeRevenueAccountId) {
        missingMappings.push('surcharge_revenue_account:missing');
      }
    } else {
      missingMappings.push('surcharge_revenue_account:missing');
    }
  }

  // ── 5. CREDIT: Tips payable (per-tender, not proportional) ─────
  // Liability class — never fall back to revenue.
  // tipAccountId and includeTipInDebit are resolved above (section 1) so the
  // debit and credit legs stay in sync. If no payable account, tips are excluded
  // from BOTH debit and credit — entry stays balanced, tip is logged as missing.
  if (tipAmount > 0) {
    if (includeTipInDebit && tipAccountId) {
      glLines.push({
        accountId: tipAccountId,
        debitAmount: '0',
        creditAmount: (tipAmount / 100).toFixed(2),
        locationId: data.locationId,
        terminalId: data.terminalId,
        channel: 'pos',
        memo: 'Tips payable',
      });
    } else {
      missingMappings.push('tips_payable_account:missing');
    }
  }

  // ── 6. Handle missing mappings — always log for resolution ─────
  // Skip DB writes when breaker is open to avoid amplifying pool exhaustion
  if (missingMappings.length > 0 && !isBreakerOpen()) {
    for (const reason of missingMappings) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'tender.recorded.v1',
          sourceModule: 'pos',
          sourceReferenceId: data.tenderId,
          entityType: reason.split(':')[0] ?? 'unknown',
          entityId: reason.split(':')[1] ?? reason,
          reason: `Missing GL mapping: ${reason}`,
        });
      } catch {
        // Never let unmapped-event logging block GL posting
      }
    }
  }

  // ── 6b. Pre-posting balance reconciliation ──────────────────────
  // Multiple Math.round(value * tenderRatio) calls across sub-departments
  // can accumulate beyond validateJournal's 5-cent tolerance on complex
  // split-tender transactions. Add a balancing line if debits != credits.
  {
    let totalDebitsCents = 0;
    let totalCreditsCents = 0;
    for (const line of glLines) {
      totalDebitsCents += Math.round(Number(line.debitAmount ?? 0) * 100);
      totalCreditsCents += Math.round(Number(line.creditAmount ?? 0) * 100);
    }
    const imbalanceCents = totalDebitsCents - totalCreditsCents;
    if (imbalanceCents !== 0) {
      // ONLY use the dedicated rounding account — validateJournal rejects
      // revenue-type and asset-type accounts for rounding. The fallback to
      // defaultUncategorizedRevenueAccountId was a silent conflict that caused
      // INVALID_ROUNDING_ACCOUNT errors. ensureAccountingSettings now guarantees
      // defaultRoundingAccountId is always set (wired to suspense if needed).
      const roundingAccountId = settings.defaultRoundingAccountId ?? null;
      if (roundingAccountId) {
        if (imbalanceCents > 0) {
          glLines.push({
            accountId: roundingAccountId,
            debitAmount: '0',
            creditAmount: (imbalanceCents / 100).toFixed(2),
            terminalId: data.terminalId,
            channel: 'pos',
            memo: 'Rounding adjustment (proportional allocation)',
          });
        } else {
          glLines.push({
            accountId: roundingAccountId,
            debitAmount: (Math.abs(imbalanceCents) / 100).toFixed(2),
            creditAmount: '0',
            terminalId: data.terminalId,
            channel: 'pos',
            memo: 'Rounding adjustment (proportional allocation)',
          });
        }
      }
    }
  }

  // ── 7. Only post if we have valid debit and credit lines ───────
  // With ensureAccountingSettings guaranteeing suspense account, this should
  // NEVER fire. If it does, it means the suspense guarantee failed entirely.
  if (glLines.length < 2) {
    console.error(`[pos-gl] CRITICAL: GL posting skipped for tender ${data.tenderId}: insufficient GL lines (${glLines.length}). Suspense account guarantee may have failed.`);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'tender.recorded.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.tenderId,
        entityType: 'gl_posting_gap',
        entityId: data.tenderId,
        reason: `CRITICAL: GL posting skipped — only ${glLines.length} GL lines generated. All fallback accounts missing. Tender amount=${data.amount}, order=${data.orderId}`,
      });
    } catch { /* never block tender */ }
    return;
  }

  // ── 8. Post GL entry via accounting API ────────────────────────
  // Let errors propagate to the top-level catch which classifies them
  // as permanent (swallow) or transient (re-throw for outbox retry).
  await accountingApi.postEntry(ctx, {
    businessDate: data.businessDate,
    sourceModule: 'pos',
    sourceReferenceId: data.tenderId,
    sourceIdempotencyKey: `pos:tender:${data.tenderId}`,
    memo: `POS Sale - Order ${data.orderId}`,
    currency: settings.baseCurrency,
    lines: glLines,
    forcePost: true,
  });
}
