import type { EventEnvelope } from '@oppsera/shared';
import { PermanentPostingError } from '@oppsera/shared';
import { db } from '@oppsera/db';
import {
  batchResolveSubDepartmentAccounts,
  batchResolveTaxGroupAccounts,
  resolvePaymentTypeAccounts,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';

interface ReturnLine {
  catalogItemId: string;
  catalogItemName: string;
  qty: number;
  returnedSubtotal: number; // positive cents
  returnedTax: number; // positive cents
  returnedTotal: number; // positive cents
  subDepartmentId: string | null;
  taxGroupId?: string | null; // optional — enables per-group tax reversal (added for GL accuracy)
  costCents?: number | null; // per-unit cost in cents (from original order line)
  packageComponents: Array<{
    catalogItemId: string;
    subDepartmentId: string | null;
    qty: number;
    allocatedRevenueCents: number;
  }> | null;
}

interface OrderReturnedPayload {
  returnOrderId: string;
  originalOrderId: string;
  returnType: 'full' | 'partial';
  locationId: string;
  businessDate: string;
  customerId: string | null;
  returnTotal: number; // positive cents — total refund value
  refundMethod: string | null; // optional — enables correct payment account resolution
  originalTenderId: string | null; // optional — links return to original tender for account lookup
  lines: ReturnLine[];
}

/**
 * Resolve the GL account to debit for a return line.
 *
 * Resolution chain:
 * 1. Sub-department mapping `returnsAccountId` (contra-revenue returns account)
 * 2. Tenant-level `settings.defaultReturnsAccountId`
 * 3. Fallback to `revenueAccountId` (direct revenue reversal — current behavior)
 */
function resolveReturnsAccount(
  mapping: { returnsAccountId: string | null; revenueAccountId: string } | null,
  defaultReturnsAccountId: string | null,
): string | null {
  // 1. Sub-department-specific returns account
  if (mapping?.returnsAccountId) return mapping.returnsAccountId;
  // 2. Tenant-level default returns account
  if (defaultReturnsAccountId) return defaultReturnsAccountId;
  // 3. Fallback to revenue account (direct reversal)
  if (mapping?.revenueAccountId) return mapping.revenueAccountId;
  return null;
}

/**
 * Handles order.returned.v1 events for GL posting.
 *
 * Creates reversing journal entries: debits returns (or revenue) account,
 * credits cash/payment account.
 * Never blocks returns — logs unmapped events on failure.
 */
export async function handleOrderReturnForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as OrderReturnedPayload;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'order.returned.v1',
          sourceModule: 'pos_return',
          sourceReferenceId: data.returnOrderId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL return posting skipped — accounting settings missing even after ensureAccountingSettings. Investigate immediately.',
        });
      } catch { /* never block returns */ }
      console.error(`[return-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    const postingApi = getAccountingPostingApi();
    const defaultReturnsAccountId = settings.defaultReturnsAccountId;

    // Batch-fetch all GL mappings upfront (1 query each instead of N per line).
    const subDeptMap = await batchResolveSubDepartmentAccounts(db, event.tenantId);
    const taxGroupMap = await batchResolveTaxGroupAccounts(db, event.tenantId);

    const glLines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      locationId?: string;
      memo?: string;
      subDepartmentId?: string;
      channel?: string;
    }> = [];

    // Revenue/returns reversal lines — debit returns or revenue account
    // Track total debited to detect imbalance with credit side
    let totalDebitedCents = 0;

    for (const line of data.lines) {
      const returnDollars = (line.returnedSubtotal / 100).toFixed(2);

      if (line.packageComponents && line.packageComponents.length > 0) {
        // Split by component subdepartment
        // For components without mapping, fall back to line-level or uncategorized
        const lineMapping = line.subDepartmentId
          ? (subDeptMap.get(line.subDepartmentId) ?? null)
          : null;
        const lineFallbackAccountId = resolveReturnsAccount(lineMapping, defaultReturnsAccountId)
          ?? settings.defaultUncategorizedRevenueAccountId;

        for (const comp of line.packageComponents) {
          const compCents = comp.allocatedRevenueCents != null
            ? Math.abs(comp.allocatedRevenueCents)
            : 0;

          if (compCents === 0) {
            // Log when component has null allocatedRevenueCents (legacy package without enrichment)
            // The safety net at the bottom catches the dollar mismatch, but this log
            // helps diagnose WHY the safety net fires for this return.
            if (comp.allocatedRevenueCents == null) {
              try {
                await logUnmappedEvent(db, event.tenantId, {
                  eventType: 'order.returned.v1',
                  sourceModule: 'pos_return',
                  sourceReferenceId: data.returnOrderId,
                  entityType: 'return_component_unenriched',
                  entityId: comp.catalogItemId,
                  reason: `Package component has null allocatedRevenueCents — likely a legacy package without GL enrichment. Revenue will be captured by the safety-net remainder line.`,
                });
              } catch { /* best-effort */ }
            }
            continue; // zero-value component, nothing to reverse
          }

          let accountId: string | null = null;

          if (comp.subDepartmentId) {
            const compMapping = subDeptMap.get(comp.subDepartmentId) ?? null;
            accountId = resolveReturnsAccount(compMapping, defaultReturnsAccountId);
          }

          // Fall back to line-level or uncategorized if component mapping unavailable
          if (!accountId) {
            accountId = lineFallbackAccountId ?? null;
          }

          if (!accountId) {
            try {
              await logUnmappedEvent(db, event.tenantId, {
                eventType: 'order.returned.v1',
                sourceModule: 'pos_return',
                sourceReferenceId: data.returnOrderId,
                entityType: 'return_component',
                entityId: comp.catalogItemId,
                reason: `Missing returns/revenue account for package component (sub-dept: ${comp.subDepartmentId ?? 'none'})`,
              });
            } catch { /* best-effort */ }
            continue;
          }

          const compDollars = (compCents / 100).toFixed(2);
          totalDebitedCents += compCents;
          glLines.push({
            accountId,
            debitAmount: compDollars,
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: comp.subDepartmentId ?? line.subDepartmentId ?? undefined,
            channel: 'pos',
            memo: `Return: ${line.catalogItemName} (component)`,
          });
        }
      } else {
        // Regular item
        const mapping = line.subDepartmentId
          ? (subDeptMap.get(line.subDepartmentId) ?? null)
          : null;

        const accountId = resolveReturnsAccount(mapping, defaultReturnsAccountId);

        // Fall back to uncategorized revenue if no specific mapping
        const resolvedAccountId = accountId
          ?? settings.defaultUncategorizedRevenueAccountId
          ?? null;

        if (resolvedAccountId && line.returnedSubtotal > 0) {
          totalDebitedCents += line.returnedSubtotal;
          glLines.push({
            accountId: resolvedAccountId,
            debitAmount: returnDollars,
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: line.subDepartmentId ?? undefined,
            channel: 'pos',
            memo: `Return: ${line.catalogItemName}`,
          });

          // Log unmapped event if we had to use uncategorized fallback
          if (!accountId) {
            try {
              await logUnmappedEvent(db, event.tenantId, {
                eventType: 'order.returned.v1',
                sourceModule: 'pos_return',
                sourceReferenceId: data.returnOrderId,
                entityType: 'return_line',
                entityId: line.catalogItemId,
                reason: `Missing returns/revenue account for sub-department ${line.subDepartmentId} — posted to uncategorized revenue`,
              });
            } catch { /* best-effort */ }
          }
        } else if (line.returnedSubtotal > 0) {
          try {
            await logUnmappedEvent(db, event.tenantId, {
              eventType: 'order.returned.v1',
              sourceModule: 'pos_return',
              sourceReferenceId: data.returnOrderId,
              entityType: 'return_line',
              entityId: line.catalogItemId,
              reason: `Missing returns/revenue account for sub-department ${line.subDepartmentId} — no fallback available`,
            });
          } catch { /* best-effort */ }
        }
      }

      // Tax reversal — debit tax payable (reverses original credit)
      // Use per-group tax account when taxGroupId is available, fallback to default
      if (line.returnedTax > 0) {
        const taxAccountId = (line.taxGroupId ? taxGroupMap.get(line.taxGroupId) : null)
          ?? settings.defaultSalesTaxPayableAccountId
          ?? null;
        if (taxAccountId) {
          totalDebitedCents += line.returnedTax;
          const taxDollars = (line.returnedTax / 100).toFixed(2);
          glLines.push({
            accountId: taxAccountId,
            debitAmount: taxDollars,
            creditAmount: '0',
            locationId: data.locationId,
            channel: 'pos',
            memo: line.taxGroupId
              ? `Return tax: ${line.catalogItemName} (group ${line.taxGroupId})`
              : `Return tax: ${line.catalogItemName}`,
          });
        }
      }
    }

    // COGS / inventory reversal — reverse the COGS debit and inventory credit
    // from the original sale when perpetual COGS posting is enabled.
    // Debit Inventory / Credit COGS (mirrors the original sale's Debit COGS / Credit Inventory).
    if (settings.cogsPostingMode === 'perpetual') {
      // Reuse subDeptMap fetched at line 99 — no duplicate query needed
      for (const line of data.lines) {
        if (!line.costCents || line.costCents <= 0) continue;

        const subDeptId = line.subDepartmentId ?? 'unmapped';
        const subDeptMapping = subDeptId !== 'unmapped' ? subDeptMap.get(subDeptId) : undefined;
        if (!subDeptMapping?.cogsAccountId || !subDeptMapping?.inventoryAccountId) continue;

        const totalCostCents = Math.round(line.costCents * line.qty);
        if (totalCostCents <= 0) continue;

        const costDollars = (totalCostCents / 100).toFixed(2);

        // Debit inventory (restore stock value)
        glLines.push({
          accountId: subDeptMapping.inventoryAccountId,
          debitAmount: costDollars,
          creditAmount: '0',
          locationId: data.locationId,
          subDepartmentId: subDeptId !== 'unmapped' ? subDeptId : undefined,
          channel: 'pos',
          memo: `Return COGS reversal: ${line.catalogItemName} (inventory restore)`,
        });

        // Credit COGS (reverse expense)
        glLines.push({
          accountId: subDeptMapping.cogsAccountId,
          debitAmount: '0',
          creditAmount: costDollars,
          locationId: data.locationId,
          subDepartmentId: subDeptId !== 'unmapped' ? subDeptId : undefined,
          channel: 'pos',
          memo: `Return COGS reversal: ${line.catalogItemName}`,
        });
      }
    }

    // Safety net: if some debit lines were skipped (unmapped), the total debited
    // will be less than returnTotal. Post the difference to uncategorized revenue
    // so debits = credits. Without this, validateJournal throws UnbalancedJournalError.
    const unmappedCents = data.returnTotal - totalDebitedCents;
    if (unmappedCents > 0 && settings.defaultUncategorizedRevenueAccountId) {
      const unmappedDollars = (unmappedCents / 100).toFixed(2);
      glLines.push({
        accountId: settings.defaultUncategorizedRevenueAccountId,
        debitAmount: unmappedDollars,
        creditAmount: '0',
        locationId: data.locationId,
        channel: 'pos',
        memo: `Return: unmapped revenue reversal — order ${data.originalOrderId}`,
      });
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'order.returned.v1',
          sourceModule: 'pos_return',
          sourceReferenceId: data.returnOrderId,
          entityType: 'return_unmapped_remainder',
          entityId: data.returnOrderId,
          reason: `$${unmappedDollars} of return revenue could not be mapped to specific accounts — posted to uncategorized revenue. Resolve GL mappings for full sub-department granularity.`,
        });
      } catch { /* best-effort */ }
    }

    // Credit side — cash/payment account (refund to customer)
    // Derive credit from actual sum of debit lines posted (not payload total).
    // If some debit lines were skipped (unmapped, no fallback), the credit
    // matches what was actually debited. Ensures debits = credits always.
    const actualDebitCents = glLines.reduce(
      (sum, line) => sum + Math.round(Number(line.debitAmount) * 100),
      0,
    );
    const refundDollars = (actualDebitCents / 100).toFixed(2);

    // Resolve refund account: prefer payment type mapping from the original tender's
    // payment method, fall back to undeposited funds
    let refundAccountId: string | null = null;
    if (data.refundMethod) {
      try {
        const paymentAccounts = await resolvePaymentTypeAccounts(db, event.tenantId, data.refundMethod);
        refundAccountId = paymentAccounts?.depositAccountId ?? paymentAccounts?.clearingAccountId ?? null;
      } catch { /* best-effort */ }
    }
    if (!refundAccountId) {
      refundAccountId = settings.defaultUndepositedFundsAccountId;
      // Log unmapped event for missing refund method — consistent with POS adapter's
      // payment_type logging for visibility in unmapped events dashboard
      if (!data.refundMethod) {
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'order.returned.v1',
            sourceModule: 'pos_return',
            sourceReferenceId: data.returnOrderId,
            entityType: 'payment_type',
            entityId: 'return_refund',
            reason: `Return has no refundMethod — used undeposited funds fallback. Original order: ${data.originalOrderId}`,
          });
        } catch { /* best-effort */ }
      }
    }

    if (refundAccountId && glLines.length > 0) {
      glLines.push({
        accountId: refundAccountId,
        debitAmount: '0',
        creditAmount: refundDollars,
        locationId: data.locationId,
        channel: 'pos',
        memo: `Return refund: order ${data.originalOrderId}`,
      });
    }

    if (glLines.length < 2) return; // Need at least debit + credit

    // Build synthetic context for posting (same pattern as POS adapter)
    const syntheticCtx = {
      tenantId: event.tenantId,
      locationId: data.locationId,
      user: { id: 'system', email: 'system@oppsera.io', name: 'System', tenantId: event.tenantId, tenantStatus: 'active', membershipStatus: 'active' },
      requestId: `return-gl-${data.returnOrderId}`,
      isPlatformAdmin: false,
    } as RequestContext;

    await postingApi.postEntry(syntheticCtx, {
      businessDate: data.businessDate,
      sourceModule: 'pos_return',
      sourceReferenceId: data.returnOrderId,
      sourceIdempotencyKey: `returns:return:${data.returnOrderId}`,
      memo: `Return for order ${data.originalOrderId}`,
      currency: settings.baseCurrency,
      lines: glLines,
      forcePost: true,
    });
  } catch (err) {
    console.error(`GL return posting failed for return ${data.returnOrderId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'order.returned.v1',
        sourceModule: 'pos_return',
        sourceReferenceId: data.returnOrderId,
        entityType: err instanceof PermanentPostingError ? 'permanent_posting_error' : 'transient_posting_error',
        entityId: data.returnOrderId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }

    // Permanent errors (missing accounts, config) will never succeed on retry.
    // Transient errors (DB timeout, pool exhaustion) re-throw for outbox retry.
    if (err instanceof PermanentPostingError) return;
    throw err;
  }
}
