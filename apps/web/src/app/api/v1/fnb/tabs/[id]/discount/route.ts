import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { discountCheck, discountCheckSchema } from '@oppsera/module-fnb';

function extractTabId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/fnb/tabs/{id}/discount → id is at parts[parts.length - 2]
  return parts[parts.length - 2]!;
}

// POST /api/v1/fnb/tabs/:id/discount — apply discount to tab's check
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tabId = extractTabId(request);
    const body = await request.json();

    // Map frontend field names to schema: 'percent'→'percentage', 'fixed'→'fixed'
    const discountType = body.discountType === 'percent' ? 'percentage' : body.discountType;
    // Frontend sends dollar value for fixed — schema expects cents
    const rawValue = Number(body.value);
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      throw new ValidationError('Invalid discount value', [{ field: 'value', message: 'Value must be a non-negative number' }]);
    }
    const value = discountType === 'fixed' ? Math.round(rawValue * 100) : rawValue;

    const parsed = discountCheckSchema.safeParse({
      orderId: tabId,
      discountType,
      value,
      reason: body.reason,
      clientRequestId: body.clientRequestId || crypto.randomUUID(),
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await discountCheck(ctx, ctx.locationId ?? '', parsed.data);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
