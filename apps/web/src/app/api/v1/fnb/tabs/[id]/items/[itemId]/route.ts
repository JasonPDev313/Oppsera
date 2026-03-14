import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { deleteTabItem } from '@oppsera/module-fnb';

function extractIds(request: NextRequest): { tabId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/fnb/tabs/{tabId}/items/{itemId}
  return { tabId: parts[parts.length - 3]!, itemId: parts[parts.length - 1]! };
}

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { tabId, itemId } = extractIds(request);

    await deleteTabItem(ctx, tabId, itemId);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: { deleted: true } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
