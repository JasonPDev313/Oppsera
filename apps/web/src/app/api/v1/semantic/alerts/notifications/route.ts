import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAlertNotifications } from '@oppsera/db';

// ── GET /api/v1/semantic/alerts/notifications ─────────────────────
// List alert notifications for the current tenant.
// Returns { data: { notifications: [...], unreadCount: N } }
// Supports:
//   ?unreadOnly=true  — show only unread notifications
//   ?severity=warning — filter by severity (info, warning, critical)
//   ?limit=50&cursor=xxx — cursor pagination

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const severity = url.searchParams.get('severity') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [eq(semanticAlertNotifications.tenantId, ctx.tenantId)];
    if (unreadOnly) {
      conditions.push(eq(semanticAlertNotifications.isRead, false));
    }
    if (severity) {
      conditions.push(eq(semanticAlertNotifications.severity, severity));
    }
    if (cursor) {
      const { lt } = await import('drizzle-orm');
      conditions.push(lt(semanticAlertNotifications.id, cursor));
    }

    // Fetch notifications + unread count in parallel
    const [rows, unreadResult] = await Promise.all([
      db
        .select()
        .from(semanticAlertNotifications)
        .where(and(...conditions))
        .orderBy(
          semanticAlertNotifications.isRead,
          desc(semanticAlertNotifications.createdAt),
        )
        .limit(limit + 1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(semanticAlertNotifications)
        .where(
          and(
            eq(semanticAlertNotifications.tenantId, ctx.tenantId),
            eq(semanticAlertNotifications.isRead, false),
          ),
        ),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const unreadCount = unreadResult[0]?.count ?? 0;

    return NextResponse.json({
      data: {
        notifications: items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          severity: n.severity,
          read: n.isRead,
          createdAt: n.createdAt,
        })),
        unreadCount,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/alerts/notifications ────────────────────
// Mark all notifications as read for the current tenant.

export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    await db
      .update(semanticAlertNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(semanticAlertNotifications.tenantId, ctx.tenantId),
          eq(semanticAlertNotifications.isRead, false),
        ),
      );

    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
