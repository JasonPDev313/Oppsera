import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import {
  resolveSubDepartmentAccounts,
  resolvePaymentTypeAccounts,
  resolveTaxGroupAccount,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

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
 *   DEBIT:  Cash/Deposit/Clearing = tenderAmount + tipAmount
 *   DEBIT:  Discount (contra-revenue) = proportional share of discountTotal
 *   DEBIT:  Processing Fee Expense = fee amount (when available)
 *   CREDIT: Revenue = proportional share of line subtotals (by sub-department)
 *   CREDIT: Service Charge Revenue = proportional share of serviceChargeTotal
 *   CREDIT: Tax Payable = proportional share of taxTotal (by tax group)
 *   CREDIT: Tips Payable = tipAmount
 *   CREDIT: Cash/Deposit (fee offset) = fee amount (reduces net deposit)
 *   DEBIT:  COGS = proportional share of cost (when enabled)
 *   CREDIT: Inventory = proportional share of cost (when enabled)
 *
 * NEVER blocks tenders — all failures are logged and swallowed.
 */
export async function handleTenderForAccounting(event: EventEnvelope): Promise<void> {
  const { tenantId } = event;
  const data = event.data as unknown as TenderRecordedPayload;

  // Check if accounting is enabled for this tenant
  const settings = await getAccountingSettings(db, tenantId);
  if (!settings) return; // no accounting — skip silently

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
  if (orderTotal <= 0) return; // zero-dollar order — nothing to post
  const tenderRatio = data.amount / orderTotal;

  const tipAmount = data.tipAmount ?? 0;
  const discountTotal = data.discountTotal ?? 0;
  const serviceChargeTotal = data.serviceChargeTotal ?? 0;

  const glLines: GlLine[] = [];
  const missingMappings: string[] = [];

  // ── 1. DEBIT: Payment received (tender amount + tip) ───────────
  // The total cash/deposit = amount applied to order + tip
  const paymentMethod = data.tenderType ?? data.paymentMethod ?? 'unknown';
  const paymentTypeMapping = await resolvePaymentTypeAccounts(db, tenantId, paymentMethod);
  if (!paymentTypeMapping) {
    missingMappings.push(`payment_type:${paymentMethod}`);
  } else {
    // If undeposited funds workflow is enabled, use clearing account
    const depositAccountId = settings.enableUndepositedFundsWorkflow && paymentTypeMapping.clearingAccountId
      ? paymentTypeMapping.clearingAccountId
      : paymentTypeMapping.depositAccountId;

    const totalDebitCents = data.amount + tipAmount;
    const tenderDollars = (totalDebitCents / 100).toFixed(2);
    glLines.push({
      accountId: depositAccountId,
      debitAmount: tenderDollars,
      creditAmount: '0',
      locationId: data.locationId,
      customerId: data.customerId,
      terminalId: data.terminalId,
      channel: 'pos',
      memo: `POS tender ${paymentMethod}`,
    });

    // ── Processing fee (debit expense, credit deposit) ─────────
    // When feeExpenseAccountId is configured and we have a fee amount,
    // post the fee as a separate debit/credit pair. Currently, the POS
    // does not calculate processing fees at tender time, so this is
    // infrastructure-ready — will activate when fee data is available.
    // (Intentionally a no-op until fee amount is added to the event.)
  }

  // ── 2. CREDIT: Revenue + Tax + COGS + Discounts + Svc Charges ──
  if (data.lines && data.lines.length > 0) {
    // Group revenue by subDepartmentId (applying proportional ratio)
    const revenueBySubDept = new Map<string, number>();
    const cogsLines: Array<{ subDeptId: string; costCents: number }> = [];
    const taxByGroup = new Map<string, number>();

    // COGS: only post per-tender in perpetual mode (periodic/disabled skip)
    const shouldPostCogs = settings.cogsPostingMode === 'perpetual'
      || (settings.cogsPostingMode !== 'periodic' && settings.enableCogsPosting);

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
          // Apply proportional ratio to each component's allocated revenue
          revenueBySubDept.set(compSubDeptId, existing + Math.round(comp.allocatedRevenueCents * tenderRatio));
        }
      } else {
        // Regular item or legacy package: use line-level subdepartment
        const subDeptId = line.subDepartmentId ?? 'unmapped';
        const existing = revenueBySubDept.get(subDeptId) ?? 0;
        revenueBySubDept.set(subDeptId, existing + Math.round(line.extendedPriceCents * tenderRatio));
      }

      if (line.costCents && shouldPostCogs) {
        const subDeptId = line.subDepartmentId ?? 'unmapped';
        cogsLines.push({ subDeptId, costCents: Math.round(line.costCents * line.qty * tenderRatio) });
      }

      if (line.taxGroupId && line.taxAmountCents) {
        const existingTax = taxByGroup.get(line.taxGroupId) ?? 0;
        taxByGroup.set(line.taxGroupId, existingTax + Math.round(line.taxAmountCents * tenderRatio));
      }
    }

    // ── Revenue credits ──────────────────────────────────────────
    // Compute total revenue for discount distribution
    const totalRevenueCents = Array.from(revenueBySubDept.values()).reduce((sum, v) => sum + v, 0);

    for (const [subDeptId, amountCents] of revenueBySubDept) {
      if (subDeptId === 'unmapped') {
        missingMappings.push(`sub_department:unmapped`);
        continue;
      }

      const subDeptMapping = await resolveSubDepartmentAccounts(db, tenantId, subDeptId);
      if (!subDeptMapping) {
        missingMappings.push(`sub_department:${subDeptId}`);
        continue;
      }

      if (amountCents > 0) {
        glLines.push({
          accountId: subDeptMapping.revenueAccountId,
          debitAmount: '0',
          creditAmount: (amountCents / 100).toFixed(2),
          locationId: data.locationId,
          subDepartmentId: subDeptId,
          terminalId: data.terminalId,
          channel: 'pos',
          memo: `Revenue - sub-dept ${subDeptId}`,
        });
      }

      // ── Discount debit (contra-revenue by sub-department) ────
      if (discountTotal > 0 && totalRevenueCents > 0 && subDeptMapping.discountAccountId) {
        const subDeptDiscountShare = Math.round(
          discountTotal * tenderRatio * (amountCents / totalRevenueCents),
        );
        if (subDeptDiscountShare > 0) {
          glLines.push({
            accountId: subDeptMapping.discountAccountId,
            debitAmount: (subDeptDiscountShare / 100).toFixed(2),
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: subDeptId,
            terminalId: data.terminalId,
            channel: 'pos',
            memo: `Discount - sub-dept ${subDeptId}`,
          });
        }
      } else if (discountTotal > 0 && totalRevenueCents > 0 && !subDeptMapping.discountAccountId) {
        missingMappings.push(`discount_account:${subDeptId}`);
      }
    }

    // COGS entries (debit COGS, credit Inventory) — proportional share
    if (shouldPostCogs) {
      const cogsBySubDept = new Map<string, number>();
      for (const c of cogsLines) {
        const existing = cogsBySubDept.get(c.subDeptId) ?? 0;
        cogsBySubDept.set(c.subDeptId, existing + c.costCents);
      }

      for (const [subDeptId, costCents] of cogsBySubDept) {
        const subDeptMapping = await resolveSubDepartmentAccounts(db, tenantId, subDeptId);
        if (!subDeptMapping || !subDeptMapping.cogsAccountId || !subDeptMapping.inventoryAccountId) continue;

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

    // Tax credits — proportional share
    for (const [taxGroupId, taxCents] of taxByGroup) {
      const taxAccountId = await resolveTaxGroupAccount(db, tenantId, taxGroupId);
      if (!taxAccountId) {
        missingMappings.push(`tax_group:${taxGroupId}`);
        continue;
      }

      if (taxCents > 0) {
        glLines.push({
          accountId: taxAccountId,
          debitAmount: '0',
          creditAmount: (taxCents / 100).toFixed(2),
          locationId: data.locationId,
          terminalId: data.terminalId,
          channel: 'pos',
          memo: `Sales tax - group ${taxGroupId}`,
        });
      }
    }
  } else {
    // No line detail — single credit to a default revenue account or skip
    missingMappings.push('no_line_detail');
  }

  // ── 3. CREDIT: Service charge revenue (proportional share) ─────
  if (serviceChargeTotal > 0) {
    const svcChargeCents = Math.round(serviceChargeTotal * tenderRatio);
    if (svcChargeCents > 0 && settings.defaultServiceChargeRevenueAccountId) {
      glLines.push({
        accountId: settings.defaultServiceChargeRevenueAccountId,
        debitAmount: '0',
        creditAmount: (svcChargeCents / 100).toFixed(2),
        locationId: data.locationId,
        terminalId: data.terminalId,
        channel: 'pos',
        memo: 'Service charge revenue',
      });
    } else if (svcChargeCents > 0 && !settings.defaultServiceChargeRevenueAccountId) {
      missingMappings.push('service_charge_account:missing');
    }
  }

  // ── 4. CREDIT: Tips payable (per-tender, not proportional) ─────
  if (tipAmount > 0) {
    if (settings.defaultTipsPayableAccountId) {
      glLines.push({
        accountId: settings.defaultTipsPayableAccountId,
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

  // ── 5. Handle missing mappings ─────────────────────────────────
  if (missingMappings.length > 0) {
    for (const reason of missingMappings) {
      await logUnmappedEvent(db, tenantId, {
        eventType: 'tender.recorded.v1',
        sourceModule: 'pos',
        sourceReferenceId: data.tenderId,
        entityType: reason.split(':')[0] ?? 'unknown',
        entityId: reason.split(':')[1] ?? reason,
        reason: `Missing GL mapping: ${reason}`,
      });
    }

    // If we're missing the payment type mapping (debit side), we can't post at all
    if (!paymentTypeMapping) return;
  }

  // ── 6. Only post if we have valid debit and credit lines ───────
  if (glLines.length < 2) return;

  // ── 7. Post GL entry via accounting API ────────────────────────
  try {
    await accountingApi.postEntry(ctx, {
      businessDate: data.businessDate,
      sourceModule: 'pos',
      sourceReferenceId: data.tenderId,
      memo: `POS Sale - Order ${data.orderId}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });
  } catch (error) {
    // POS adapter must NEVER block tenders — log and continue
    console.error(`POS GL posting failed for tender ${data.tenderId}:`, error);
    await logUnmappedEvent(db, tenantId, {
      eventType: 'tender.recorded.v1',
      sourceModule: 'pos',
      sourceReferenceId: data.tenderId,
      entityType: 'posting_error',
      entityId: data.tenderId,
      reason: `GL posting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}
