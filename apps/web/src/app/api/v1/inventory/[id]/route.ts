import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getInventoryItem } from '@oppsera/module-inventory';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getInventoryItem(ctx.tenantId, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'inventory', permission: 'inventory.view' },
);
