import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const POST = withAdminPermission(async (req: NextRequest, session, params) => {
  const userId = params?.id;
  if (!userId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'User ID required' } }, { status: 400 });
  }

  const body = await req.json();
  const { action, reason } = body;

  const validActions = ['lock', 'unlock', 'force_password_reset', 'reset_mfa', 'revoke_sessions'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: `Invalid action. Valid: ${validActions.join(', ')}` } }, { status: 400 });
  }

  // Verify user exists
  const userResult = await db.execute(sql`SELECT id, email, tenant_id FROM users WHERE id = ${userId}`);
  const users = Array.from(userResult as Iterable<Record<string, unknown>>);
  if (users.length === 0) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
  }
  const user = users[0]!;

  switch (action) {
    case 'lock': {
      if (!reason) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Reason required for locking' } }, { status: 400 });
      }
      // Set locked_until to far future
      await db.execute(sql`
        INSERT INTO user_security (user_id, locked_until)
        VALUES (${userId}, '2099-12-31T23:59:59Z')
        ON CONFLICT (user_id) DO UPDATE SET locked_until = '2099-12-31T23:59:59Z'
      `);
      break;
    }

    case 'unlock': {
      await db.execute(sql`
        UPDATE user_security SET locked_until = NULL, failed_login_count = 0
        WHERE user_id = ${userId}
      `);
      break;
    }

    case 'force_password_reset': {
      await db.execute(sql`
        UPDATE users SET password_reset_required = true WHERE id = ${userId}
      `);
      break;
    }

    case 'reset_mfa': {
      await db.execute(sql`
        UPDATE user_security SET mfa_enabled = false WHERE user_id = ${userId}
      `);
      break;
    }

    case 'revoke_sessions': {
      // Mark user as requiring password reset to invalidate existing sessions
      await db.execute(sql`
        UPDATE users SET password_reset_required = true WHERE id = ${userId}
      `);
      break;
    }
  }

  void logAdminAudit({
    session,
    action: `user.${action}`,
    entityType: 'user',
    entityId: userId,
    tenantId: user.tenant_id as string,
    reason,
    afterSnapshot: { action, userId, email: user.email },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({ data: { success: true, action } });
}, { permission: 'users.staff.edit' });
