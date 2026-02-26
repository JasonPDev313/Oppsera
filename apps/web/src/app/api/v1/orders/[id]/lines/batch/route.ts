import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { addLineItemsBatch, addLineItemsBatchSchema } from '@oppsera/module-orders';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/orders/:id/lines/batch → id is 3 segments before end
  return parts[parts.length - 3]!;
}

// POST /api/v1/orders/:id/lines/batch — add multiple line items in one transaction
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = addLineItemsBatchSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await addLineItemsBatch(ctx, orderId, parsed.data.items);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'orders.manage', writeAccess: true },
);
