import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  liftHold,
  liftHoldSchema,
} from '@oppsera/module-membership';

function extractHoldId(url: string): string {
  // URL shape: .../holds/{holdId}/lift
  const parts = url.split('/holds/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const holdId = extractHoldId(request.url);
    if (!holdId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Hold ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = liftHoldSchema.safeParse({
      ...body,
      holdId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await liftHold(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);
