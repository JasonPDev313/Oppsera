import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';

// GET /api/v1/orders/:id/guest-pay/active — check for active guest pay session
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // URL: /api/v1/orders/[id]/guest-pay/active
    const orderId = segments[segments.indexOf('orders') + 1]!;

    const result = await withTenant(ctx.tenantId, async (tx) => {
      const sessions = await tx.execute(
        sql`SELECT id, token, status, total_cents, tip_cents,
                   expires_at, created_at
            FROM guest_pay_sessions
            WHERE tenant_id = ${ctx.tenantId} AND tab_id = ${orderId} AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1`,
      );

      const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
      if (rows.length === 0) return { hasActive: false, session: null };

      const s = rows[0]!;
      const expiresAt = new Date(s.expires_at as string);

      // Lazily expire if past deadline
      if (expiresAt <= new Date()) {
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

    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'orders.create' },
);
