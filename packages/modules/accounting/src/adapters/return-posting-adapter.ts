import type { EventEnvelope } from '@oppsera/shared';
import { db } from '@oppsera/db';
import {
  resolveSubDepartmentAccounts,
  logUnmappedEvent,
} from '../helpers/resolve-mapping';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
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
    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) return;

    const postingApi = getAccountingPostingApi();
    const defaultReturnsAccountId = settings.defaultReturnsAccountId;

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
    for (const line of data.lines) {
      const returnDollars = (line.returnedSubtotal / 100).toFixed(2);

      if (line.packageComponents && line.packageComponents.length > 0) {
        // Split by component subdepartment
        for (const comp of line.packageComponents) {
          if (!comp.subDepartmentId || comp.allocatedRevenueCents == null) continue;
          const compMapping = await resolveSubDepartmentAccounts(db, event.tenantId, comp.subDepartmentId);

          const accountId = resolveReturnsAccount(compMapping, defaultReturnsAccountId);
          if (!accountId) continue;

          const compDollars = (Math.abs(comp.allocatedRevenueCents) / 100).toFixed(2);
          glLines.push({
            accountId,
            debitAmount: compDollars,
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: comp.subDepartmentId,
            channel: 'pos',
            memo: `Return: ${line.catalogItemName} (component)`,
          });
        }
      } else {
        // Regular item
        const mapping = line.subDepartmentId
          ? await resolveSubDepartmentAccounts(db, event.tenantId, line.subDepartmentId)
          : null;

        const accountId = resolveReturnsAccount(mapping, defaultReturnsAccountId);

        if (accountId) {
          glLines.push({
            accountId,
            debitAmount: returnDollars,
            creditAmount: '0',
            locationId: data.locationId,
            subDepartmentId: line.subDepartmentId ?? undefined,
            channel: 'pos',
            memo: `Return: ${line.catalogItemName}`,
          });
        } else if (line.returnedSubtotal > 0) {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'order.returned.v1',
            sourceModule: 'pos_return',
            sourceReferenceId: data.returnOrderId,
            entityType: 'return_line',
            entityId: line.catalogItemId,
            reason: `Missing returns/revenue account for sub-department ${line.subDepartmentId}`,
          });
        }
      }

      // Tax reversal — debit tax payable (reverses original credit)
      if (line.returnedTax > 0 && settings.defaultSalesTaxPayableAccountId) {
        const taxDollars = (line.returnedTax / 100).toFixed(2);
        glLines.push({
          accountId: settings.defaultSalesTaxPayableAccountId,
          debitAmount: taxDollars,
          creditAmount: '0',
          locationId: data.locationId,
          channel: 'pos',
          memo: `Return tax: ${line.catalogItemName}`,
        });
      }
    }

    // Credit side — cash/payment account (refund to customer)
    const refundDollars = (data.returnTotal / 100).toFixed(2);
    const refundAccountId = settings.defaultUndepositedFundsAccountId;

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
      memo: `Return for order ${data.originalOrderId}`,
      lines: glLines,
      forcePost: true,
    });
  } catch (err) {
    // Never block returns
    console.error(`GL return posting failed for return ${data.returnOrderId}:`, err);
    try {
      await logUnmappedEvent(db, event.tenantId, {
        eventType: 'order.returned.v1',
        sourceModule: 'pos_return',
        sourceReferenceId: data.returnOrderId,
        entityType: 'posting_error',
        entityId: data.returnOrderId,
        reason: `GL posting failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } catch { /* best-effort tracking */ }
  }
}
