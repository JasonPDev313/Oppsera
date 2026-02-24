import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  skipCleaning,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // segments: [..., 'assignments', '{id}', 'skip']
    const assignmentId = segments[segments.length - 2]!;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    const result = await skipCleaning(ctx, assignmentId, reason);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_ASSIGN, writeAccess: true },
);
