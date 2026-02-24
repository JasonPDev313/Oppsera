import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  startCleaning,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // segments: [..., 'assignments', '{id}', 'start']
    const assignmentId = segments[segments.length - 2]!;

    const result = await startCleaning(ctx, assignmentId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_COMPLETE, writeAccess: true },
);
