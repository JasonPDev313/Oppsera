import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { splitWaitlistEntry } from '@oppsera/module-fnb';
import { hostSplitWaitlistSchema } from '@oppsera/module-fnb/validation-host';

function extractId(request: NextRequest): string {
  // URL: /api/v1/fnb/host/waitlist/[id]/split
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

/**
 * POST /api/v1/fnb/host/waitlist/[id]/split
 *
 * Split a waitlist entry into two (create a new smaller party from the original).
 */
export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const body = await req.json();
    const parsed = hostSplitWaitlistSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid split request',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await splitWaitlistEntry(ctx, id, parsed.data);
    broadcastFnb(ctx, 'waitlist').catch(() => {});
    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
