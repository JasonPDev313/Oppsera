import { NextResponse } from 'next/server';
import { db, sql } from '@oppsera/db';
import { withAdminAuth } from '@/lib/with-admin-auth';

// GET /api/v1/pricing — list all pricing plans with tenant counts
export const GET = withAdminAuth(async () => {
  const rows = await db.execute(sql`
    SELECT
      p.*,
      COALESCE(tc.cnt, 0)::int AS tenant_count
    FROM pricing_plans p
    LEFT JOIN (
      SELECT pricing_plan_id, COUNT(*)::int AS cnt
      FROM tenant_subscriptions
      GROUP BY pricing_plan_id
    ) tc ON tc.pricing_plan_id = p.id
    ORDER BY p.sort_order ASC
  `);

  const plans = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    tier: r.tier as string,
    displayName: r.display_name as string,
    pricePerSeatCents: r.price_per_seat_cents as number,
    maxSeats: r.max_seats as number | null,
    baseFeeCents: r.base_fee_cents as number,
    isActive: r.is_active as boolean,
    features: r.features as string[],
    sortOrder: r.sort_order as number,
    tenantCount: r.tenant_count as number,
  }));

  return NextResponse.json({ data: plans });
}, 'viewer');
