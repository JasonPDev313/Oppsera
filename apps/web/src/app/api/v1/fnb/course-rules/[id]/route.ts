import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { deleteCourseRule, deleteCourseRuleSchema } from '@oppsera/module-fnb';

// DELETE /api/v1/fnb/course-rules/[id]
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const ruleId = segments[segments.length - 1];

    const body = await request.json().catch(() => ({}));
    const parsed = deleteCourseRuleSchema.safeParse({ ...body, ruleId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await deleteCourseRule(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'fnb', permission: 'fnb.manage', writeAccess: true },
);
