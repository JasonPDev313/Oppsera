import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';
import type { EventEnvelope } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import { ensureAccountingSettings } from '../helpers/ensure-accounting-settings';
import { logUnmappedEvent } from '../helpers/resolve-mapping';

interface ReceiptPostedData {
  receiptId: string;
  receiptNumber: string;
  vendorId: string;
  locationId: string;
  freightMode: string;
  lineCount: number;
  subtotal: number; // dollars (NUMERIC(12,4))
  shippingCost: number; // dollars
  taxAmount: number; // dollars
  total: number; // dollars
}

interface ReceiptVoidedData {
  receiptId: string;
  receiptNumber: string;
  vendorId: string;
  locationId: string;
  lineCount: number;
  reason: string;
}

/**
 * GL posting for inventory receipt posted.
 *
 * When goods are received from a vendor:
 *   Dr Inventory Asset               / Cr AP Accrued (or Uncategorized)
 *   Dr Freight Expense (if EXPENSE)  / Cr AP Accrued (if freight exists)
 *
 * NOTE: receipt amounts are in DOLLARS (NUMERIC(12,4)), NOT cents.
 *
 * Never throws — GL failures never block receiving operations.
 */
export async function handleInventoryReceiptPostedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as ReceiptPostedData;

  try {
    // Zero-total receipts skip GL
    if (Number(data.total) === 0) return;

    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'inventory.receipt.posted.v1',
          sourceModule: 'inventory',
          sourceReferenceId: data.receiptId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL inventory receipt posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[inventory-receipt-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Inventory asset account
    const settingsAny = settings as Record<string, any>;
    const inventoryAccountId = (settingsAny.defaultInventoryAssetAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    // AP accrued / payable account
    const apAccountId = (settingsAny.defaultAPControlAccountId as string | null)
      ?? settings.defaultUncategorizedRevenueAccountId;

    if (!inventoryAccountId || !apAccountId) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'inventory.receipt.posted.v1',
          sourceModule: 'inventory',
          sourceReferenceId: data.receiptId,
          entityType: 'gl_account',
          entityId: !inventoryAccountId ? 'inventory_asset' : 'ap_control',
          reason: `Inventory receipt ${data.receiptNumber} ($${Number(data.total).toFixed(2)}) has no ${!inventoryAccountId ? 'Inventory Asset' : 'AP Control'} GL account configured.`,
        });
      } catch { /* best-effort */ }
      return;
    }

    const lines: Array<{ accountId: string; debitAmount: string; creditAmount: string; memo: string }> = [];

    const shippingDollars = Number(data.shippingCost).toFixed(2);

    // Main inventory entry: Dr Inventory Asset for subtotal + tax (landed cost)
    const inventoryDebit = (Number(data.subtotal) + Number(data.taxAmount)).toFixed(2);
    if (Number(inventoryDebit) > 0) {
      lines.push({
        accountId: inventoryAccountId,
        debitAmount: inventoryDebit,
        creditAmount: '0',
        memo: `Inventory received — ${data.receiptNumber} (${data.lineCount} lines)`,
      });
    }

    // Freight handling depends on mode
    if (Number(data.shippingCost) > 0) {
      if (data.freightMode === 'expense') {
        // Freight as separate expense
        lines.push({
          accountId: settings.defaultUncategorizedRevenueAccountId ?? inventoryAccountId,
          debitAmount: shippingDollars,
          creditAmount: '0',
          memo: `Freight expense — ${data.receiptNumber}`,
        });
      } else {
        // ALLOCATE mode: freight already included in line costs, add to inventory
        lines.push({
          accountId: inventoryAccountId,
          debitAmount: shippingDollars,
          creditAmount: '0',
          memo: `Freight allocated to inventory — ${data.receiptNumber}`,
        });
      }
    }

    // Credit side: AP accrued for total amount
    const totalDollars = Number(data.total).toFixed(2);
    lines.push({
      accountId: apAccountId,
      debitAmount: '0',
      creditAmount: totalDollars,
      memo: `AP accrued — receipt ${data.receiptNumber}`,
    });

    if (lines.length === 0) return;

    const postingApi = getAccountingPostingApi();
    await postingApi.postEntry(
      {
        tenantId: event.tenantId,
        user: { id: 'system', email: '' },
        requestId: `inventory-receipt-gl-${data.receiptId}`,
      } as any,
      {
        businessDate: new Date().toISOString().split('T')[0]!,
        sourceModule: 'inventory',
        sourceReferenceId: `receipt-${data.receiptId}`,
        memo: `Inventory receipt posted: ${data.receiptNumber} — $${totalDollars}`,
        lines,
        forcePost: true,
      },
    );
  } catch (error) {
    console.error(`[inventory-receipt-gl] GL posting failed for receipt ${data.receiptId}:`, error);
  }
}

/**
 * GL posting for inventory receipt voided.
 *
 * Reverses the original posting:
 *   Dr AP Accrued  / Cr Inventory Asset
 *
 * We use the original receipt's GL entry to determine amounts.
 * Falls back to logging unmapped if original entry not found.
 *
 * Never throws — GL failures never block receiving operations.
 */
export async function handleInventoryReceiptVoidedForAccounting(event: EventEnvelope): Promise<void> {
  const data = event.data as unknown as ReceiptVoidedData;

  try {
    try { await ensureAccountingSettings(db, event.tenantId); } catch { /* non-fatal */ }

    const settings = await getAccountingSettings(db, event.tenantId);
    if (!settings) {
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'inventory.receipt.voided.v1',
          sourceModule: 'inventory',
          sourceReferenceId: data.receiptId,
          entityType: 'accounting_settings',
          entityId: event.tenantId,
          reason: 'CRITICAL: GL inventory receipt void posting skipped — accounting settings missing even after ensureAccountingSettings.',
        });
      } catch { /* best-effort */ }
      console.error(`[inventory-receipt-gl] CRITICAL: accounting settings missing for tenant=${event.tenantId} after ensureAccountingSettings`);
      return;
    }

    // Look up the original GL entry and create a proper reversal with actual amounts
    const postingApi = getAccountingPostingApi();
    const originalRefId = `receipt-${data.receiptId}`;

    try {
      // Query original GL journal entry + lines by sourceReferenceId
      const originalEntryRows = await db.execute(sql`
        SELECT je.id, je.business_date
        FROM gl_journal_entries je
        WHERE je.tenant_id = ${event.tenantId}
          AND je.source_module = 'inventory'
          AND je.source_reference_id = ${originalRefId}
          AND je.status = 'posted'
        LIMIT 1
      `);
      const entryArr = Array.from(originalEntryRows as Iterable<Record<string, unknown>>);

      if (entryArr.length === 0) {
        // No original GL entry found — log for manual resolution
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'inventory.receipt.voided.v1',
            sourceModule: 'inventory',
            sourceReferenceId: data.receiptId,
            entityType: 'gl_journal_entry',
            entityId: originalRefId,
            reason: `Receipt ${data.receiptNumber} voided (${data.reason}) but no original GL entry found (ref: ${originalRefId}). Accountant must create manual reversing entry if needed.`,
          });
        } catch { /* best-effort */ }
        return;
      }

      const originalEntryId = String(entryArr[0]!.id);

      // Fetch original lines to create exact reversal
      const originalLineRows = await db.execute(sql`
        SELECT account_id, debit_amount, credit_amount, memo
        FROM gl_journal_lines
        WHERE journal_entry_id = ${originalEntryId}
      `);
      const lineArr = Array.from(originalLineRows as Iterable<Record<string, unknown>>);

      if (lineArr.length === 0) {
        try {
          await logUnmappedEvent(db, event.tenantId, {
            eventType: 'inventory.receipt.voided.v1',
            sourceModule: 'inventory',
            sourceReferenceId: data.receiptId,
            entityType: 'gl_journal_entry',
            entityId: originalRefId,
            reason: `Receipt ${data.receiptNumber} voided (${data.reason}) — original GL entry found but has no lines. Investigate.`,
          });
        } catch { /* best-effort */ }
        return;
      }

      // Build reversal lines: swap debits and credits
      const reversalLines = lineArr.map((line) => ({
        accountId: String(line.account_id),
        debitAmount: String(line.credit_amount ?? '0'),
        creditAmount: String(line.debit_amount ?? '0'),
        memo: `Void reversal: ${line.memo ? String(line.memo) : `Receipt ${data.receiptNumber}`}`,
      }));

      await postingApi.postEntry(
        {
          tenantId: event.tenantId,
          user: { id: 'system', email: '' },
          requestId: `inventory-receipt-gl-void-${data.receiptId}`,
        } as any,
        {
          businessDate: new Date().toISOString().split('T')[0]!,
          sourceModule: 'inventory',
          sourceReferenceId: `receipt-void-${data.receiptId}`,
          memo: `Inventory receipt voided: ${data.receiptNumber} — ${data.reason}`,
          lines: reversalLines,
          forcePost: true,
        },
      );
    } catch (voidError) {
      // If reversal fails, log it for manual resolution
      try {
        await logUnmappedEvent(db, event.tenantId, {
          eventType: 'inventory.receipt.voided.v1',
          sourceModule: 'inventory',
          sourceReferenceId: data.receiptId,
          entityType: 'gl_journal_entry',
          entityId: data.receiptId,
          reason: `Receipt ${data.receiptNumber} voided but GL reversal failed: ${voidError instanceof Error ? voidError.message : 'Unknown'}. Accountant must create manual reversing entry.`,
        });
      } catch { /* best-effort */ }
      console.error(`[inventory-receipt-gl] GL void posting failed for receipt ${data.receiptId}:`, voidError);
    }
  } catch (error) {
    console.error(`[inventory-receipt-gl] GL void posting failed for receipt ${data.receiptId}:`, error);
  }
}
