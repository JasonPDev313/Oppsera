import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { assertImpersonationCanVoid } from '@oppsera/core/auth/impersonation-safety';
import { ValidationError } from '@oppsera/shared';
import { voidOrderLine, voidOrderLineSchema } from '@oppsera/core/pos-ops';
import { withTenant, orderLines } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

// POST /api/v1/pos-ops/void-line — Void a single order line
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = voidOrderLineSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Impersonation safety: block void-line if line total > $500
    if (ctx.impersonation) {
      const line = await withTenant(ctx.tenantId, async (tx) => {
        const [row] = await tx
          .select({ lineSubtotal: orderLines.lineSubtotal })
          .from(orderLines)
          .where(and(eq(orderLines.tenantId, ctx.tenantId), eq(orderLines.id, parsed.data.orderLineId)))
          .limit(1);
        return row;
      });
      if (line) {
        assertImpersonationCanVoid(ctx, line.lineSubtotal);
      }
    }

    const result = await voidOrderLine(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 200 });
  },
  { entitlement: 'orders', permission: 'orders.void' , writeAccess: true },
);
