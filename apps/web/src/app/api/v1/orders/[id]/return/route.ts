import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanRefund } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import { createReturn, createReturnSchema } from '@oppsera/module-orders';
import { withTenant, orderLines } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/return — create line-item return
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = createReturnSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Impersonation safety: block returns totaling > $500
    if (ctx.impersonation) {
      const lineIds = parsed.data.returnLines.map((l) => l.originalLineId);
      const lines = await withTenant(ctx.tenantId, async (tx) => {
        return tx
          .select({ id: orderLines.id, lineSubtotal: orderLines.lineSubtotal })
          .from(orderLines)
          .where(and(eq(orderLines.tenantId, ctx.tenantId), inArray(orderLines.id, lineIds)));
      });
      const totalCents = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
      assertImpersonationCanRefund(ctx, totalCents);
    }

    const result = await createReturn(ctx, orderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'returns.create' , writeAccess: true },
);
