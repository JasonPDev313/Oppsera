import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { voidCheck, voidCheckSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/[id]/check/void — void a check
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = voidCheckSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const parts = request.nextUrl.pathname.split('/');
    const tabId = parts[parts.length - 3]!; // /tabs/[id]/check/void

    const result = await voidCheck(ctx, ctx.locationId ?? '', tabId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' , writeAccess: true },
);
