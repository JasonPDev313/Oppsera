import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { withAdminDb } from '@/lib/admin-db';

// ── GET /api/v1/health/alerts — Alert log with filters ─────────────

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const level = sp.get('level') ?? '';
  const tenantId = sp.get('tenant_id') ?? '';
  const limit = Math.min(Number(sp.get('limit') ?? 50), 200);

  const data = await withAdminDb(async (tx) => {
    const ts = (v: unknown) =>
      v instanceof Date ? v.toISOString() : v ? String(v) : null;

    // Build WHERE conditions
    const conditions = [sql`1=1`];
    if (level) {
      conditions.push(sql`level = ${level}`);
    }
    if (tenantId) {
      conditions.push(sql`tenant_id = ${tenantId}`);
    }
    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        id, level, title, details, tenant_id, context, sent_at, channel
      FROM alert_log
      WHERE ${whereClause}
      ORDER BY sent_at DESC
      LIMIT ${limit}
    `);

    const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      level: r.level as string,
      title: r.title as string,
      details: r.details as string | null,
      tenantId: r.tenant_id as string | null,
      context: r.context as Record<string, unknown> | null,
      sentAt: ts(r.sent_at),
      channel: r.channel as string | null,
    }));

    return items;
  });

  return NextResponse.json({ data });
}, { permission: 'tenants.read' });
