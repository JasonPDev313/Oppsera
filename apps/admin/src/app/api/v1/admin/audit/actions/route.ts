import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/admin/audit/actions — Distinct platform audit action types ──

export const GET = withAdminPermission(
  async () => {
    const actions = await withAdminDb(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT DISTINCT action
        FROM platform_admin_audit_log
        ORDER BY action
      `);
      return Array.from(rows as Iterable<{ action: string }>).map((r) => r.action);
    });
    return NextResponse.json({ data: actions });
  },
  { permission: 'system.view' },
);
