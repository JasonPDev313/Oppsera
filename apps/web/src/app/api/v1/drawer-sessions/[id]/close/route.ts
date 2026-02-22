import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { closeDrawerSession, closeDrawerSessionSchema } from '@oppsera/core/drawer-sessions';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // URL: /api/v1/drawer-sessions/[id]/close — id is second-to-last
  return parts[parts.length - 2]!;
}

// POST /api/v1/drawer-sessions/[id]/close — Close a drawer session
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = closeDrawerSessionSchema.safeParse({
      ...body,
      drawerSessionId: id,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const session = await closeDrawerSession(ctx, parsed.data);
    return NextResponse.json({ data: session });
  },
  { entitlement: 'orders', permission: 'shift.manage' },
);
