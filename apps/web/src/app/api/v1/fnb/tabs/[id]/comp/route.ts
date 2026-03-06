import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { compItem, compItemSchema } from '@oppsera/module-fnb';

function extractTabId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/fnb/tabs/{id}/comp → id is at parts[parts.length - 2]
  return parts[parts.length - 2]!;
}

// POST /api/v1/fnb/tabs/:id/comp — comp tab items
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tabId = extractTabId(request);
    const body = await request.json();

    const parsed = compItemSchema.safeParse({
      orderId: tabId,
      orderLineId: body.orderLineId,
      reason: body.reason,
      clientRequestId: body.clientRequestId || crypto.randomUUID(),
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await compItem(ctx, ctx.locationId ?? '', parsed.data);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
