import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { clearTable } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tables/:id/clear — clear table (mark dirty or available)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tableId = parts[parts.length - 2]!;
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body is valid — all fields optional */ }

    const result = await clearTable(ctx, tableId, {
      clientRequestId: body.clientRequestId as string | undefined,
      markAvailable: body.markAvailable as boolean | undefined,
      expectedVersion: body.expectedVersion as number | undefined,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' , writeAccess: true },
);
