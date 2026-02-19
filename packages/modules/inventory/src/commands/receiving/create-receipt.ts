import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, NotFoundError, generateUlid } from '@oppsera/shared';
import { receivingReceipts, vendors } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateReceiptInput } from '../../validation/receiving';

function generateReceiptNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const suffix = generateUlid().slice(-6).toUpperCase();
  return `RCV-${y}${m}${d}-${suffix}`;
}

export async function createDraftReceipt(
  ctx: RequestContext,
  input: CreateReceiptInput,
) {
  if (!ctx.locationId && !input.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'Location is required', 400);
  }
  const locationId = input.locationId || ctx.locationId!;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify vendor exists and belongs to tenant
    const vendorRows = await (tx as any)
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, ctx.tenantId), eq(vendors.id, input.vendorId)));
    if (!vendorRows[0]) throw new NotFoundError('Vendor');

    const receiptNumber = generateReceiptNumber();

    const [created] = await (tx as any)
      .insert(receivingReceipts)
      .values({
        tenantId: ctx.tenantId,
        locationId,
        vendorId: input.vendorId,
        receiptNumber,
        status: 'draft',
        vendorInvoiceNumber: input.vendorInvoiceNumber ?? null,
        receivedDate: input.receivedDate,
        shippingCost: (input.shippingCost ?? 0).toString(),
        shippingAllocationMethod: input.shippingAllocationMethod ?? 'none',
        taxAmount: (input.taxAmount ?? 0).toString(),
        subtotal: '0',
        total: '0',
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    const receipt = created!;
    const event = buildEventFromContext(ctx, 'inventory.receipt.created.v1', {
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      vendorId: receipt.vendorId,
      locationId,
      status: 'draft',
    });

    return { result: receipt, events: [event] };
  });

  await auditLog(ctx, 'inventory.receipt.created', 'receiving_receipt', result.id);
  return result;
}
