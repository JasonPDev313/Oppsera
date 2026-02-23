import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { recordDrawerEvent, recordDrawerEventSchema } from '@oppsera/core/drawer-sessions';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // URL: /api/v1/drawer-sessions/[id]/events — id is second-to-last
  return parts[parts.length - 2]!;
}

// POST /api/v1/drawer-sessions/[id]/events — Record a drawer event (paid-in/out, cash-drop, no-sale)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = recordDrawerEventSchema.safeParse({
      ...body,
      drawerSessionId: id,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const event = await recordDrawerEvent(ctx, parsed.data);
    return NextResponse.json({ data: event }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'cash.drawer' , writeAccess: true },
);
