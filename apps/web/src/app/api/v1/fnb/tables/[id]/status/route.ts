import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { updateTableStatus, updateTableStatusSchema } from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/tables/:id/status — update table status
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tableId = parts[parts.length - 2]!;
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = updateTableStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateTableStatus(ctx, tableId, parsed.data);
    broadcastFnb(ctx, 'tables').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' , writeAccess: true },
);
