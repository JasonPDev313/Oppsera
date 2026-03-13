import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { fireCourseFromKds, fireCourseFromKdsSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tickets/[id]/fire-course — fire a course from KDS
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = request.nextUrl.pathname.split('/');
    const fireCourseIdx = segments.indexOf('fire-course');
    const ticketId = fireCourseIdx > 0 ? segments[fireCourseIdx - 1] : undefined;

    const body = await request.json();
    const parsed = fireCourseFromKdsSchema.safeParse({ ...body, ticketId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const course = await fireCourseFromKds(ctx, parsed.data);
    broadcastFnb(ctx, 'kds', 'tabs').catch(() => {});
    return NextResponse.json({ data: course });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true, requireLocation: true },
);
