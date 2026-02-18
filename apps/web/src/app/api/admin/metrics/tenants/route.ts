import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin only' } },
        { status: 403 },
      );
    }

    // Per-tenant summary
    const result = await db.execute(sql`
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.status,
        t.plan,
        t.created_at,
        COALESCE(orders.count, 0) AS orders_today,
        COALESCE(events.count, 0) AS events_24h,
        COALESCE(events.last_activity, t.created_at) AS last_activity,
        COALESCE(users.count, 0) AS user_count
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM orders o
        WHERE o.tenant_id = t.id AND o.created_at >= CURRENT_DATE
      ) orders ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count, MAX(created_at) AS last_activity
        FROM event_outbox e
        WHERE e.tenant_id = t.id AND e.created_at > NOW() - INTERVAL '24 hours'
      ) events ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM users u
        WHERE u.tenant_id = t.id
      ) users ON true
      ORDER BY events.count DESC NULLS LAST
    `);

    return NextResponse.json({
      data: Array.from(result as Iterable<Record<string, unknown>>),
    });
  },
  { permission: 'platform.admin' },
);
