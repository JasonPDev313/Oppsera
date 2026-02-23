import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getAdminSession, requireRole } from './auth';
import type { AdminSession, AdminRole } from './auth';
import { getAdminPermissions, matchAdminPermission } from './admin-permissions';

type AdminHandler = (
  req: NextRequest,
  session: AdminSession,
  params?: Record<string, string>,
) => Promise<NextResponse>;

interface WithAdminPermissionOptions {
  /** Backward-compat role check (optional). */
  minRole?: AdminRole;
  /** Granular permission string, e.g. 'users.staff.view'. */
  permission?: string;
}

/**
 * Enhanced admin middleware that supports granular permissions.
 *
 * - Validates session (JWT cookie)
 * - Optional legacy role check via `minRole`
 * - Granular permission check via `permission`
 * - Legacy super_admin always bypasses granular checks
 *
 * Existing routes using `withAdminAuth` are unaffected.
 */
export function withAdminPermission(
  handler: AdminHandler,
  options: WithAdminPermissionOptions = {},
) {
  return async (req: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      );
    }

    // Legacy role check (backward compat)
    if (options.minRole && !requireRole(session, options.minRole)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Insufficient role' } },
        { status: 403 },
      );
    }

    // Granular permission check
    if (options.permission) {
      // Legacy super_admin always passes (backward compat)
      if (session.role !== 'super_admin') {
        const perms = await getAdminPermissions(session.adminId);
        if (!matchAdminPermission(perms, options.permission)) {
          return NextResponse.json(
            { error: { code: 'FORBIDDEN', message: 'Missing permission: ' + options.permission } },
            { status: 403 },
          );
        }
      }
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
