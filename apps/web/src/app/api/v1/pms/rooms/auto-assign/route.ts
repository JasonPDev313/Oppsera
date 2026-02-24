import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  runAutoAssignment,
  runAutoAssignmentSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// POST /api/v1/pms/rooms/auto-assign
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = runAutoAssignmentSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await runAutoAssignment(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.ASSIGNMENT_MANAGE, writeAccess: true },
);
