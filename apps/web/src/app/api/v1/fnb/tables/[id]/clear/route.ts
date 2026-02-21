import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { clearTable } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tables/:id/clear — clear table (mark dirty or available)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tableId = parts[parts.length - 2]!;
    const body = await request.json().catch(() => ({}));

    const result = await clearTable(ctx, tableId, {
      clientRequestId: body.clientRequestId,
      markAvailable: body.markAvailable,
      expectedVersion: body.expectedVersion,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' },
);
