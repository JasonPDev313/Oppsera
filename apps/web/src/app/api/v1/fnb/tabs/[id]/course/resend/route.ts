import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { resendCourseToKds } from '@oppsera/module-fnb';
import { z } from 'zod';

const resendSchema = z.object({
  courseNumber: z.number().int().min(1),
});

// POST /api/v1/fnb/tabs/:id/course/resend — re-create kitchen tickets for a sent course
// Use when the event consumer silently failed and no tickets were created.
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 3]!;
    const body = await request.json();
    const parsed = resendSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await resendCourseToKds(ctx, {
      tabId,
      courseNumber: parsed.data.courseNumber,
    });

    broadcastFnb(ctx, 'kds', 'tabs').catch(() => {});

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
