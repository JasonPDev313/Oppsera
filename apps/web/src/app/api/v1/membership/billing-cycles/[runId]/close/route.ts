import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  reviewAndCloseCycle,
  reviewAndCloseCycleSchema,
} from '@oppsera/module-membership';

function extractRunId(url: string): string {
  const parts = url.split('/billing-cycles/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const runId = extractRunId(request.url);
    if (!runId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Run ID is required' } },
        { status: 400 },
      );
    }

    const parsed = reviewAndCloseCycleSchema.safeParse({ runId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await reviewAndCloseCycle(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.billing', writeAccess: true },
);
