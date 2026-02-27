import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import type { RequestContext } from '@oppsera/core/auth/context';
import { apBills, apBillLines, apBillLandedCostAllocations } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';

interface AllocateLandedCostInput {
  billId: string;
  postAdjustingEntry?: boolean; // If true, creates GL entry to move freight from expense to inventory
  clientRequestId?: string;
}

export async function allocateLandedCost(ctx: RequestContext, input: AllocateLandedCostInput) {
  const accountingApi = getAccountingPostingApi();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    if (input.clientRequestId) {
      const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'allocateLandedCost');
      if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // 1. Load bill — must be posted
    const [bill] = await tx
      .select()
      .from(apBills)
      .where(and(eq(apBills.id, input.billId), eq(apBills.tenantId, ctx.tenantId)))
      .limit(1);

    if (!bill) throw new NotFoundError('Bill', input.billId);
    if (bill.status === 'draft' || bill.status === 'voided') {
      throw new AppError('BILL_STATUS_ERROR', 'Bill must be posted to allocate landed cost', 400);
    }

    // 2. Load bill lines
    const lines = await tx
      .select()
      .from(apBillLines)
      .where(eq(apBillLines.billId, input.billId));

    const freightLines = lines.filter((l) => l.lineType === 'freight');
    const inventoryLines = lines.filter((l) => l.lineType === 'inventory');

    if (freightLines.length === 0) {
      throw new AppError('NO_FREIGHT', 'Bill has no freight lines to allocate', 400);
    }
    if (inventoryLines.length === 0) {
      throw new AppError('NO_INVENTORY', 'Bill has no inventory lines to receive freight allocation', 400);
    }

    // 3. Allocate freight proportionally by inventory line cost
    const totalInventoryCost = inventoryLines.reduce((s, l) => s + Number(l.amount), 0);
    const allocations: Array<{
      id: string;
      billId: string;
      freightLineId: string;
      inventoryLineId: string;
      allocatedAmount: string;
    }> = [];

    for (const freightLine of freightLines) {
      const freightAmount = Number(freightLine.amount);
      let allocatedSoFar = 0;

      // Sort by amount desc, then id asc for deterministic remainder distribution
      const sortedInvLines = [...inventoryLines].sort((a, b) => {
        const diff = Number(b.amount) - Number(a.amount);
        return diff !== 0 ? diff : a.id.localeCompare(b.id);
      });

      for (let i = 0; i < sortedInvLines.length; i++) {
        const invLine = sortedInvLines[i]!;
        let allocated: number;

        if (i === sortedInvLines.length - 1) {
          // Last line gets remainder
          allocated = Number((freightAmount - allocatedSoFar).toFixed(2));
        } else {
          const proportion = Number(invLine.amount) / totalInventoryCost;
          allocated = Number((freightAmount * proportion).toFixed(2));
        }

        allocatedSoFar += allocated;
        allocations.push({
          id: generateUlid(),
          billId: input.billId,
          freightLineId: freightLine.id,
          inventoryLineId: invLine.id,
          allocatedAmount: allocated.toFixed(2),
        });
      }
    }

    // 4. Insert allocations
    for (const alloc of allocations) {
      await tx.insert(apBillLandedCostAllocations).values(alloc);
    }

    // 5. Optionally post adjusting GL entry (Dr Inventory Asset, Cr Freight Expense)
    let glEntryId: string | null = null;
    if (input.postAdjustingEntry) {
      // Group inventory allocations by account
      const invAccountAmounts = new Map<string, number>();
      for (const alloc of allocations) {
        const invLine = inventoryLines.find((l) => l.id === alloc.inventoryLineId);
        if (invLine) {
          const current = invAccountAmounts.get(invLine.accountId) ?? 0;
          invAccountAmounts.set(invLine.accountId, current + Number(alloc.allocatedAmount));
        }
      }

      const glLines: Array<{ accountId: string; debitAmount: string; creditAmount: string; memo?: string }> = [];

      // Debit each inventory account for allocated freight
      for (const [accountId, amount] of invAccountAmounts) {
        glLines.push({
          accountId,
          debitAmount: amount.toFixed(2),
          creditAmount: '0',
          memo: 'Landed cost allocation',
        });
      }

      // Credit freight accounts
      for (const fl of freightLines) {
        glLines.push({
          accountId: fl.accountId,
          debitAmount: '0',
          creditAmount: fl.amount,
          memo: 'Freight reclassified to inventory',
        });
      }

      const glResult = await accountingApi.postEntry(ctx, {
        businessDate: bill.billDate,
        sourceModule: 'ap',
        sourceReferenceId: `lca-${bill.id}`,
        memo: `Landed cost allocation for Bill ${bill.billNumber}`,
        currency: bill.currency,
        lines: glLines,
        forcePost: true,
      });
      glEntryId = glResult.id;
    }

    const resultData = { billId: input.billId, allocations, glEntryId };

    // Save idempotency key
    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'allocateLandedCost', resultData);
    }

    return {
      result: resultData,
      events: [],
    };
  });

  await auditLog(ctx, 'ap.landed_cost.allocated', 'ap_bill', input.billId);
  return result;
}
