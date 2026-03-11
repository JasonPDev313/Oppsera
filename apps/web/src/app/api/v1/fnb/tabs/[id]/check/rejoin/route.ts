import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { rejoinChecks, rejoinChecksSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/[id]/check/rejoin — rejoin split checks
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = rejoinChecksSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await rejoinChecks(ctx, ctx.locationId ?? '', parsed.data);
    broadcastFnb(ctx, 'tabs').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' , writeAccess: true },
);
