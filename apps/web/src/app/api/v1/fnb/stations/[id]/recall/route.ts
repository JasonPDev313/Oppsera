import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { recallItem, recallItemSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/stations/[id]/recall — recall a bumped item back to cooking
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = recallItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await recallItem(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: item });
  },
  { entitlement: 'kds', permission: 'kds.recall', writeAccess: true },
);
