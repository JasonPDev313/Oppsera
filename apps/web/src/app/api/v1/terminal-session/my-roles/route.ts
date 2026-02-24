import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getUserRoleAssignments } from '@oppsera/core/permissions';

// GET /api/v1/terminal-session/my-roles
export const GET = withMiddleware(
  async (_request, ctx) => {
    const roles = await getUserRoleAssignments(ctx.tenantId, ctx.user.id);

    return NextResponse.json({
      data: {
        roles,
        autoSelect: roles.length === 1,
      },
    });
  },
  { entitlement: 'platform_core' },
);
