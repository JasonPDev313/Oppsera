import { db, isBreakerOpen } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { PermanentPostingError } from '@oppsera/shared';
import {
  resolvePaymentTypeAccounts,
  batchResolveSubDepartmentAccounts,
  batchResolveTaxGroupAccounts,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { sql } from 'drizzle-orm';

/**
 * F&B per-tender GL posting adapter — consumes fnb.payment.tender_applied.v1.
 *
 * Mirrors the retail POS handleTenderForAccounting pattern: each tender gets
 * its own GL entry with proportional allocation of revenue, tax, discounts,
 * and service charges by sub-department.
 *
 * This closes the gap where F&B payments only reach the GL at batch-close time.
 * With this consumer, GL entries are created in real-time per tender.
 *
 * The batch-close flow remains as a reconciliation safety net. Its GL posting
 * checks for existing per-tender entries via sourceIdempotencyKey to avoid
 * double-posting.
 */

interface FnbTenderAppliedPayload {
  paymentSessionId: string;
  tenderId: string;
  tabId: string;
  orderId: string;
  locationId: string;
  amountCents: number;
  tenderType: string;
}

interface GlLine {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  locationId?: string;
  subDepartmentId?: string;
  channel?: string;
  memo?: string;
}

// Circuit breaker skip tracking (same pattern as pos-posting-adapter)
let _breakerSkipCount = 0;
let _breakerSkipFirstAt: string | null = null;

export async function handleFnbTenderForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as FnbTenderAppliedPayload;

  // Circuit breaker fast-exit
  if (isBreakerOpen()) {
    _breakerSkipCount++;
    if (!_breakerSkipFirstAt) _breakerSkipFirstAt = new Date().toISOString();
    console.warn(`[fnb-tender-gl] Skipped GL posting for tender ${data.tenderId}: circuit breaker open (skipped: ${_breakerSkipCount})`);
    return;
  }

  // Flush breaker skip summary on recovery
  if (_breakerSkipCount > 0) {
    const skipped = _breakerSkipCount;
    const since = _breakerSkipFirstAt;
    _breakerSkipCount = 0;
    _breakerSkipFirstAt = null;
    console.error(`[fnb-tender-gl] Circuit breaker recovered — ${skipped} GL posting(s) skipped since ${since}. Outbox worker will retry.`);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'fnb.payment.tender_applied.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.tenderId,
        entityType: 'breaker_skip_summary',
        entityId: tenantId,
        reason: `Circuit breaker was open — ${skipped} GL posting(s) skipped since ${since}. Outbox worker will retry missed events.`,
      });
    } catch { /* best-effort */ }
  }

  try {
    await handleFnbTenderInner(event, tenantId, data);
  } catch (error) {
    console.error(`[fnb-tender-gl] GL posting failed for F&B tender ${data.tenderId}:`, error);

    if (!isBreakerOpen()) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'fnb.payment.tender_applied.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.tenderId,
          entityType: error instanceof PermanentPostingError ? 'permanent_posting_error' : 'transient_posting_error',
          entityId: data.tenderId,
          reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } catch { /* best-effort */ }
    }

    if (error instanceof PermanentPostingError) {
      return; // logged above, no retry
    }
    throw error; // transient — let outbox retry
  }
}

async function handleFnbTenderInner(
  event: EventEnvelope,
  tenantId: string,
  data: FnbTenderAppliedPayload,
): Promise<void> {
  // Ensure accounting settings exist (auto-create if missing)
  let settings = await getAccountingSettings(db, tenantId).catch(() => null);

  if (settings?.enableLegacyGlPosting) return;

  const needsEnsure = !settings
    || !settings.defaultRoundingAccountId
    || !settings.defaultUncategorizedRevenueAccountId
    || !settings.defaultUndepositedFundsAccountId;

  if (needsEnsure) {
    try {
      await ensureAccountingSettings(db, tenantId);
      settings = await getAccountingSettings(db, tenantId);
    } catch (ensureErr) {
      console.error(`[fnb-tender-gl] ensureAccountingSettings failed for tenant=${tenantId}:`, ensureErr instanceof Error ? ensureErr.message : ensureErr);
    }
    if (!settings) {
      throw new Error(
        `GL posting deferred: accounting_settings unavailable for tenant=${tenantId}, tender=${data.tenderId} — will retry`,
      );
    }
  }

  if (!settings) return;

  // Read order details
  const orderResult = await db.execute(sql`
    SELECT id, subtotal, tax_total, discount_total, service_charge_total, total, business_date
    FROM orders
    WHERE id = ${data.orderId} AND tenant_id = ${tenantId}
  `);
  const orderRows = Array.from(orderResult as Iterable<Record<string, unknown>>);
  if (orderRows.length === 0) {
    console.warn(`[fnb-tender-gl] Order ${data.orderId} not found for tender ${data.tenderId}`);
    return;
  }
  const order = orderRows[0]!;

  const orderTotal = Number(order.total) || 0;
  if (orderTotal <= 0) {
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'fnb.payment.tender_applied.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.tenderId,
        entityType: 'zero_dollar_order',
        entityId: data.orderId,
        reason: `GL posting skipped: orderTotal=${orderTotal} (zero/negative-dollar order, tender=${data.tenderId})`,
      });
    } catch { /* never block */ }
    return;
  }

  // Compute proportional ratio
  const tenderRatio = data.amountCents / orderTotal;
  if (!Number.isFinite(tenderRatio) || tenderRatio < 0) {
    console.error(`[fnb-tender-gl] Invalid tenderRatio=${tenderRatio} (amount=${data.amountCents}, orderTotal=${orderTotal}) for tender=${data.tenderId}`);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'fnb.payment.tender_applied.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.tenderId,
        entityType: 'invalid_ratio',
        entityId: data.tenderId,
        reason: `GL posting skipped: invalid tenderRatio=${tenderRatio} (amount=${data.amountCents}, orderTotal=${orderTotal})`,
      });
    } catch { /* never block */ }
    return;
  }

  const discountTotal = Number(order.discount_total) || 0;
  const serviceChargeTotal = Number(order.service_charge_total) || 0;
  const businessDate = (order.business_date as string) || new Date().toISOString().slice(0, 10);

  const glLines: GlLine[] = [];
  const missingMappings: string[] = [];

  // ── 1. DEBIT: Payment received (tender amount) ───────────
  const paymentMethod = data.tenderType ?? 'unknown';
  const paymentTypeMapping = await resolvePaymentTypeAccounts(db, tenantId, paymentMethod);

  const isHouseAccount = paymentMethod === 'house_account';

  let depositAccountId: string | null = null;
  if (paymentTypeMapping) {
    depositAccountId = (!isHouseAccount && settings.enableUndepositedFundsWorkflow && paymentTypeMapping.clearingAccountId)
      ? paymentTypeMapping.clearingAccountId
      : paymentTypeMapping.depositAccountId;
    if (!depositAccountId) {
      depositAccountId = settings.defaultUndepositedFundsAccountId ?? null;
      missingMappings.push(`payment_type_incomplete:${paymentMethod}`);
    }
  } else {
    depositAccountId = settings.defaultUndepositedFundsAccountId ?? null;
    missingMappings.push(`payment_type:${paymentMethod}`);
  }

  if (depositAccountId) {
    const tenderDollars = (data.amountCents / 100).toFixed(2);
    glLines.push({
      accountId: depositAccountId,
      debitAmount: tenderDollars,
      creditAmount: '0',
      locationId: data.locationId,
      channel: 'fnb',
      memo: paymentTypeMapping
        ? `F&B tender ${paymentMethod}`
        : `F&B tender ${paymentMethod} (fallback: undeposited funds)`,
    });
  }

  // ── 2. Read order lines for revenue/tax allocation ──────────
  const linesResult = await db.execute(sql`
    SELECT catalog_item_id, catalog_item_name, sub_department_id, tax_group_id,
           qty, final_line_subtotal, final_line_tax, final_line_total, cost_price,
           discount_allocation_cents, package_components
    FROM order_lines
    WHERE order_id = ${data.orderId} AND tenant_id = ${tenantId}
  `);
  const lineRows = Array.from(linesResult as Iterable<Record<string, unknown>>);

  if (lineRows.length > 0) {
    // Batch-fetch GL mappings (sequential to avoid pool exhaustion)
    const subDeptMap = await batchResolveSubDepartmentAccounts(db, tenantId);
    const taxGroupMap = await batchResolveTaxGroupAccounts(db, tenantId);

    // Group revenue by sub-department (proportional)
    const revenueBySubDept = new Map<string, number>();
    const taxByGroup = new Map<string, number>();

    for (const line of lineRows) {
      const subDeptId = (line.sub_department_id as string) ?? 'unmapped';
      const lineSubtotal = Number(line.final_line_subtotal) || Number(line.line_subtotal) || 0;
      const existing = revenueBySubDept.get(subDeptId) ?? 0;
      revenueBySubDept.set(subDeptId, existing + lineSubtotal * tenderRatio);

      const taxGroupId = line.tax_group_id as string | null;
      const lineTax = Number(line.final_line_tax) || 0;
      if (taxGroupId && lineTax > 0) {
        const existingTax = taxByGroup.get(taxGroupId) ?? 0;
        taxByGroup.set(taxGroupId, existingTax + lineTax * tenderRatio);
      }
    }

    // ── Revenue credits ──────────────────────────────────
    for (const [subDeptId, amountCents] of revenueBySubDept) {
      let revenueAccountId: string | null = null;
      const subDeptMapping = subDeptId !== 'unmapped' ? (subDeptMap.get(subDeptId) ?? null) : null;

      if (subDeptMapping) {
        revenueAccountId = subDeptMapping.revenueAccountId;
      } else {
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
          channel: 'fnb',
          memo: subDeptMapping
            ? `F&B Revenue - sub-dept ${subDeptId}`
            : `F&B Revenue - unmapped (fallback: uncategorized)`,
        });
      } else if (revenueAccountId && roundedCents < 0) {
        glLines.push({
          accountId: revenueAccountId,
          debitAmount: (Math.abs(roundedCents) / 100).toFixed(2),
          creditAmount: '0',
          locationId: data.locationId,
          subDepartmentId: subDeptId !== 'unmapped' ? subDeptId : undefined,
          channel: 'fnb',
          memo: `F&B Revenue reversal - sub-dept ${subDeptId}`,
        });
      }
    }

    // ── Discount debits (proportional) ───────────────────
    if (discountTotal > 0) {
      const totalRevenueCents = Array.from(revenueBySubDept.values()).reduce((sum, v) => sum + v, 0);
      if (totalRevenueCents > 0) {
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
                channel: 'fnb',
                memo: `F&B Discount - sub-dept ${subDeptId}`,
              });
            }
          }
        }
      }
    }

    // ── Tax credits (proportional by tax group) ──────────
    for (const [taxGroupId, rawTaxCents] of taxByGroup) {
      let taxAccountId = taxGroupMap.get(taxGroupId) ?? null;
      if (!taxAccountId) {
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
          channel: 'fnb',
          memo: `F&B Sales tax - group ${taxGroupId}`,
        });
      }
    }
  } else {
    // No line detail — post full tender amount to uncategorized revenue
    missingMappings.push('no_line_detail');
    const fallbackRevenueAccountId = settings.defaultUncategorizedRevenueAccountId ?? null;
    if (fallbackRevenueAccountId && data.amountCents > 0) {
      glLines.push({
        accountId: fallbackRevenueAccountId,
        debitAmount: '0',
        creditAmount: (data.amountCents / 100).toFixed(2),
        locationId: data.locationId,
        channel: 'fnb',
        memo: 'F&B Revenue - no line detail (fallback: uncategorized)',
      });
    }
  }

  // ── 3. CREDIT: Service charge revenue (proportional) ─────
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
        channel: 'fnb',
        memo: settings.defaultServiceChargeRevenueAccountId
          ? 'F&B Service charge revenue'
          : 'F&B Service charge revenue (fallback: uncategorized)',
      });
      if (!settings.defaultServiceChargeRevenueAccountId) {
        missingMappings.push('service_charge_account:missing');
      }
    }
  }

  // ── 4. Log missing mappings ────────────────────────────────
  if (missingMappings.length > 0 && !isBreakerOpen()) {
    for (const reason of missingMappings) {
      try {
        await logUnmappedEvent(db, tenantId, {
          eventType: 'fnb.payment.tender_applied.v1',
          sourceModule: 'fnb',
          sourceReferenceId: data.tenderId,
          entityType: reason.split(':')[0] ?? 'unknown',
          entityId: reason.split(':')[1] ?? reason,
          reason: `Missing GL mapping: ${reason}`,
        });
      } catch { /* never block */ }
    }
  }

  // ── 5. Pre-posting balance reconciliation ──────────────────
  {
    let totalDebitsCents = 0;
    let totalCreditsCents = 0;
    for (const line of glLines) {
      totalDebitsCents += Math.round(Number(line.debitAmount ?? 0) * 100);
      totalCreditsCents += Math.round(Number(line.creditAmount ?? 0) * 100);
    }
    const imbalanceCents = totalDebitsCents - totalCreditsCents;
    if (imbalanceCents !== 0) {
      const roundingAccountId = settings.defaultRoundingAccountId ?? null;
      if (roundingAccountId) {
        if (imbalanceCents > 0) {
          glLines.push({
            accountId: roundingAccountId,
            debitAmount: '0',
            creditAmount: (imbalanceCents / 100).toFixed(2),
            channel: 'fnb',
            memo: 'F&B Rounding adjustment (proportional allocation)',
          });
        } else {
          glLines.push({
            accountId: roundingAccountId,
            debitAmount: (Math.abs(imbalanceCents) / 100).toFixed(2),
            creditAmount: '0',
            channel: 'fnb',
            memo: 'F&B Rounding adjustment (proportional allocation)',
          });
        }
      }
    }
  }

  // ── 6. Post GL entry ───────────────────────────────────────
  if (glLines.length < 2) {
    console.error(`[fnb-tender-gl] CRITICAL: GL posting skipped for F&B tender ${data.tenderId}: insufficient GL lines (${glLines.length}).`);
    try {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'fnb.payment.tender_applied.v1',
        sourceModule: 'fnb',
        sourceReferenceId: data.tenderId,
        entityType: 'gl_posting_gap',
        entityId: data.tenderId,
        reason: `CRITICAL: GL posting skipped — only ${glLines.length} GL lines generated. Tender amount=${data.amountCents}, order=${data.orderId}`,
      });
    } catch { /* never block */ }
    return;
  }

  const accountingApi = getAccountingPostingApi();

  const ctx: RequestContext = {
    tenantId,
    locationId: data.locationId,
    user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId, tenantStatus: 'active', membershipStatus: 'active' },
    requestId: `fnb-tender-gl-${data.tenderId}`,
    isPlatformAdmin: false,
  } as RequestContext;

  await accountingApi.postEntry(ctx, {
    businessDate,
    sourceModule: 'fnb',
    sourceReferenceId: data.tenderId,
    sourceIdempotencyKey: `fnb:tender:${data.tenderId}`,
    memo: `F&B Tender ${paymentMethod} - Order ${data.orderId}`,
    currency: settings.baseCurrency,
    lines: glLines,
    forcePost: true,
  });
}
