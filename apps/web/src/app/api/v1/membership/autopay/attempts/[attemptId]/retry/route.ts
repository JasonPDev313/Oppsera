import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  retryFailedAutopay,
  retryFailedAutopaySchema,
} from '@oppsera/module-membership';

function extractAttemptId(url: string): string {
  // URL shape: .../attempts/{attemptId}/retry
  const parts = url.split('/attempts/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const attemptId = extractAttemptId(request.url);
    if (!attemptId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Attempt ID is required' } },
        { status: 400 },
      );
    }

    const parsed = retryFailedAutopaySchema.safeParse({ attemptId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await retryFailedAutopay(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);
