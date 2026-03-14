import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { voidTabItem, voidTabItemSchema } from '@oppsera/module-fnb';

function extractIds(request: NextRequest): { tabId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/fnb/tabs/{tabId}/items/{itemId}/void
  const voidIdx = parts.lastIndexOf('void');
  return { tabId: parts[voidIdx - 3]!, itemId: parts[voidIdx - 1]! };
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { tabId, itemId } = extractIds(request);
    const body = await request.json();

    const parsed = voidTabItemSchema.safeParse({
      reason: body.reason,
      clientRequestId: body.clientRequestId || crypto.randomUUID(),
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await voidTabItem(ctx, tabId, itemId, parsed.data);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
