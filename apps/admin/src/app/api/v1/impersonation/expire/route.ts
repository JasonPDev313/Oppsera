import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { expireOverdueSessions } from '@oppsera/core/auth/impersonation';
import { logAdminAudit } from '@/lib/admin-audit';

/**
 * POST /api/v1/impersonation/expire
 * Cron job: expires all overdue impersonation sessions.
 * Called by Vercel Cron or external scheduler every 5 minutes.
 * Protected by CRON_SECRET header check.
 */
export async function POST(req: NextRequest) {
  // Simple auth: check cron secret or admin bearer
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: { message: 'CRON_SECRET not configured' } }, { status: 500 });
  }

  const expired = await expireOverdueSessions();

  // Audit log each expired session (best-effort)
  for (const session of expired) {
    void logAdminAudit({
      session: {
        adminId: session.adminId,
        email: session.adminEmail,
        name: session.adminName,
        role: 'super_admin' as const,
      },
      action: 'impersonation.expired',
      entityType: 'impersonation_session',
      entityId: session.id,
      tenantId: session.tenantId,
      metadata: {
        targetUserId: session.targetUserId,
        actionCount: session.actionCount,
      },
    });
  }

  return NextResponse.json({
    data: { expiredCount: expired.length },
  });
}
