import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireRole } from './auth';
import type { AdminSession, AdminRole } from './auth';

type AdminHandler = (
  req: NextRequest,
  session: AdminSession,
  params?: Record<string, string>,
) => Promise<NextResponse>;

export function withAdminAuth(handler: AdminHandler, minRole: AdminRole = 'viewer') {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }
    if (!requireRole(session, minRole)) {
      return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 });
    }
    const params = context?.params ? await context.params : undefined;
    try {
      return await handler(req, session, params);
    } catch (err) {
      console.error(`[admin-api] ${req.method} ${req.nextUrl.pathname} error:`, err);
      const message = err instanceof Error ? err.message : 'Internal server error';
      return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message } }, { status: 500 });
    }
  };
}
