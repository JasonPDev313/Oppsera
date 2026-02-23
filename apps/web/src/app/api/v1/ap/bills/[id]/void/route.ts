import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { voidBill, voidBillSchema } from '@oppsera/module-ap';

// POST /api/v1/ap/bills/:id/void — void a bill
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const billId = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = voidBillSchema.safeParse({
      billId,
      reason: body.reason,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await voidBill(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'ap', permission: 'ap.manage' , writeAccess: true },
);
