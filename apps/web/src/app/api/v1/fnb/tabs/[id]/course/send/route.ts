import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { sendCourse, sendCourseSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/:id/course/send — send a course to kitchen
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 3]!;
    const body = await request.json();
    const parsed = sendCourseSchema.safeParse({ ...body, tabId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await sendCourse(ctx, parsed.data);
    broadcastFnb(ctx, 'kds', 'tabs').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' , writeAccess: true },
);
