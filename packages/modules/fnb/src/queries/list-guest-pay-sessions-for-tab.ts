import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/**
 * All sessions for a tab (active + historical). Tenant-scoped.
 */
export async function listGuestPaySessionsForTab(tenantId: string, tabId: string) {
  return withTenant(tenantId, async (tx) => {
    const sessions = await tx.execute(
      sql`SELECT id, status, total_cents, tip_cents, token,
                 expires_at, paid_at, superseded_by_id, created_at
          FROM guest_pay_sessions
          WHERE tenant_id = ${tenantId} AND tab_id = ${tabId}
          ORDER BY created_at DESC`,
    );

    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    return rows.map((s) => ({
      id: s.id as string,
      status: s.status as string,
      totalCents: s.total_cents as number,
      tipCents: (s.tip_cents as number) ?? null,
      token: s.token as string,
      expiresAt: new Date(s.expires_at as string).toISOString(),
      paidAt: s.paid_at ? new Date(s.paid_at as string).toISOString() : null,
      supersededById: (s.superseded_by_id as string) ?? null,
      createdAt: new Date(s.created_at as string).toISOString(),
    }));
  });
}
