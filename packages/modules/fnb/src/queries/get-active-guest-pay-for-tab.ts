import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/**
 * Quick check: does tab have an active guest pay session?
 * Returns the session if active, null otherwise.
 */
export async function getActiveGuestPayForTab(tenantId: string, tabId: string) {
  return withTenant(tenantId, async (tx) => {
    const sessions = await tx.execute(
      sql`SELECT id, token, status, total_cents, tip_cents,
                 expires_at, created_at
          FROM guest_pay_sessions
          WHERE tenant_id = ${tenantId} AND tab_id = ${tabId} AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1`,
    );

    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) return { hasActive: false, session: null };

    const s = rows[0]!;
    const expiresAt = new Date(s.expires_at as string);

    // Check if expired
    if (expiresAt <= new Date()) {
      // Lazily expire
      await tx.execute(
        sql`UPDATE guest_pay_sessions SET status = 'expired', updated_at = NOW()
            WHERE id = ${s.id as string} AND status = 'active'`,
      );
      return { hasActive: false, session: null };
    }

    return {
      hasActive: true,
      session: {
        id: s.id as string,
        token: s.token as string,
        status: 'active' as const,
        totalCents: s.total_cents as number,
        tipCents: (s.tip_cents as number) ?? null,
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date(s.created_at as string).toISOString(),
      },
    };
  });
}
