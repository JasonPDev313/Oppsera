import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  addWorkOrderComment,
  addWorkOrderCommentSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // segments: [..., 'work-orders', '{id}', 'comments']
    const workOrderId = segments[segments.length - 2]!;

    const body = await request.json();
    const parsed = addWorkOrderCommentSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }

    const result = await addWorkOrderComment(ctx, workOrderId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.MAINTENANCE_VIEW, writeAccess: true },
);
