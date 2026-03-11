import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { bulkApplyCourseRule, bulkApplyCourseRuleSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/course-rules/bulk-apply
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const parsed = bulkApplyCourseRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await bulkApplyCourseRule(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'fnb', permission: 'fnb.manage', writeAccess: true },
);
