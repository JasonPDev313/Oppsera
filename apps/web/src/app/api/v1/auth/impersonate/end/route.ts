import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { endImpersonationSession } from '@oppsera/core/auth/impersonation';
import { AppError } from '@oppsera/shared';

export const POST = withMiddleware(async (_request, ctx) => {
  if (!ctx.impersonation) {
    throw new AppError('NOT_IMPERSONATING', 'No active impersonation session', 400);
  }

  await endImpersonationSession(ctx.impersonation.sessionId, 'user_exit');

  return NextResponse.json({ data: { ok: true } });
});
