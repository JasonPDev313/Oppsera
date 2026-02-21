import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { auditLog } from '@oppsera/core/audit';
import { resetPassword } from '@oppsera/core';

function extractUserId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const userId = extractUserId(request);
    await resetPassword({ tenantId: ctx.tenantId, userId, actorUserId: ctx.user.id });
    await auditLog(ctx, 'user.reset_password', 'user', userId);
    return NextResponse.json({ data: { userId } });
  },
  { permission: 'users.manage' },
);
