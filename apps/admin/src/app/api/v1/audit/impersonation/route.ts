import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/audit/impersonation — Impersonation audit with nested actions ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get('admin_id') ?? undefined;
    const tenantId = sp.get('tenant_id') ?? undefined;
    const status = sp.get('status') ?? undefined;
    const dateFrom = sp.get('date_from') ?? undefined;
    const dateTo = sp.get('date_to') ?? undefined;
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit') ?? '20')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [];

      if (adminId) {
        conditions.push(sql`s.admin_id = ${adminId}`);
      }
      if (tenantId) {
        conditions.push(sql`s.tenant_id = ${tenantId}`);
      }
      if (status) {
        conditions.push(sql`s.status = ${status}`);
      }
      if (dateFrom) {
        conditions.push(sql`s.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        conditions.push(sql`s.created_at <= ${dateTo}::timestamptz`);
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM admin_impersonation_sessions s
        ${whereClause}
      `);
      const total = Number(Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0);

      // Fetch sessions
      const sessionRows = await tx.execute(sql`
        SELECT
          s.id,
          s.admin_id,
          s.admin_email,
          s.admin_name,
          s.tenant_id,
          s.tenant_name,
          s.target_user_id,
          s.reason,
          s.status,
          s.started_at,
          s.ended_at,
          s.expires_at,
          s.end_reason,
          s.ip_address,
          s.action_count,
          s.created_at
        FROM admin_impersonation_sessions s
        ${whereClause}
        ORDER BY s.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);
      const sessions = Array.from(sessionRows as Iterable<Record<string, unknown>>);

      // For each session, fetch target user name + actions during session
      const items = await Promise.all(
        sessions.map(async (s) => {
          const ts = (v: unknown) =>
            v instanceof Date ? v.toISOString() : v ? String(v) : null;

          // Get target user name
          let targetUserName: string | null = null;
          let targetUserEmail: string | null = null;
          if (s.target_user_id) {
            const userRows = await tx.execute(sql`
              SELECT display_name, email
              FROM users
              WHERE id = ${s.target_user_id as string}
              LIMIT 1
            `);
            const user = Array.from(userRows as Iterable<Record<string, unknown>>)[0];
            if (user) {
              targetUserName = user.display_name as string | null;
              targetUserEmail = user.email as string | null;
            }
          }

          // Get audit_log entries during this session
          const actionRows = await tx.execute(sql`
            SELECT
              al.action,
              al.entity_type,
              al.entity_id,
              al.changes,
              al.created_at
            FROM audit_log al
            WHERE al.actor_type = 'impersonation'
              AND al.metadata->>'impersonation_session_id' = ${s.id as string}
            ORDER BY al.created_at
          `);
          const actionsDuringSession = Array.from(
            actionRows as Iterable<Record<string, unknown>>,
          ).map((a) => ({
            action: a.action as string,
            entityType: a.entity_type as string,
            entityId: a.entity_id as string,
            changes: a.changes as Record<string, unknown> | null,
            createdAt: ts(a.created_at),
          }));

          return {
            session: {
              id: s.id as string,
              adminId: s.admin_id as string,
              adminEmail: s.admin_email as string,
              adminName: s.admin_name as string,
              tenantId: s.tenant_id as string,
              tenantName: s.tenant_name as string,
              targetUserId: s.target_user_id as string | null,
              targetUserName,
              targetUserEmail,
              reason: s.reason as string | null,
              status: s.status as string,
              startedAt: ts(s.started_at),
              endedAt: ts(s.ended_at),
              expiresAt: ts(s.expires_at),
              endReason: s.end_reason as string | null,
              ipAddress: s.ip_address as string | null,
              actionCount: Number(s.action_count ?? 0),
              createdAt: ts(s.created_at),
            },
            actionsDuringSession,
          };
        }),
      );

      return { items, total, page, limit };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'system.view' },
);
