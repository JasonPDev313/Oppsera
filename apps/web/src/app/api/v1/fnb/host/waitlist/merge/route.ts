import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { mergeWaitlistEntries } from '@oppsera/module-fnb';
import { hostMergeWaitlistSchema } from '@oppsera/module-fnb/validation-host';

/**
 * POST /api/v1/fnb/host/waitlist/merge
 *
 * Merge two waitlist entries into one (primary absorbs secondary).
 */
export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const parsed = hostMergeWaitlistSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid merge request',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await mergeWaitlistEntries(ctx, parsed.data.primaryId, parsed.data.secondaryId);
    broadcastFnb(ctx, 'waitlist').catch(() => {});
    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
