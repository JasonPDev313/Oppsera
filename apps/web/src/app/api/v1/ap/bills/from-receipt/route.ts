import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createBillFromReceipt } from '@oppsera/module-ap';

// POST /api/v1/ap/bills/from-receipt — create a bill from a receiving receipt
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    // Manual validation — no Zod schema for this endpoint
    const errors: { field: string; message: string }[] = [];
    if (!body.receiptId || typeof body.receiptId !== 'string') {
      errors.push({ field: 'receiptId', message: 'receiptId is required' });
    }
    if (!body.billNumber || typeof body.billNumber !== 'string') {
      errors.push({ field: 'billNumber', message: 'billNumber is required' });
    }
    if (!body.billDate || typeof body.billDate !== 'string') {
      errors.push({ field: 'billDate', message: 'billDate is required' });
    }
    if (!body.dueDate || typeof body.dueDate !== 'string') {
      errors.push({ field: 'dueDate', message: 'dueDate is required' });
    }
    if (!body.inventoryAccountId || typeof body.inventoryAccountId !== 'string') {
      errors.push({ field: 'inventoryAccountId', message: 'inventoryAccountId is required' });
    }
    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }

    const result = await createBillFromReceipt(ctx, {
      receiptId: body.receiptId,
      billNumber: body.billNumber,
      billDate: body.billDate,
      dueDate: body.dueDate,
      memo: body.memo ?? undefined,
      inventoryAccountId: body.inventoryAccountId,
      freightAccountId: body.freightAccountId ?? undefined,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'ap', permission: 'ap.manage' , writeAccess: true },
);
