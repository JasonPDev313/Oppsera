import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

/**
 * Staff detail view by sessionId. Tenant-scoped.
 */
export async function getGuestPaySession(tenantId: string, sessionId: string) {
  return withTenant(tenantId, async (tx) => {
    const sessions = await tx.execute(
      sql`SELECT id, tenant_id, location_id, tab_id, order_id, server_user_id,
                 token, status,
                 subtotal_cents, tax_cents, service_charge_cents,
                 discount_cents, total_cents, tip_cents, tip_percentage,
                 tip_settings_snapshot, table_number, party_size,
                 restaurant_name, expires_at, paid_at, superseded_by_id,
                 created_at, updated_at
          FROM guest_pay_sessions
          WHERE id = ${sessionId} AND tenant_id = ${tenantId}`,
    );

    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) return null;

    const s = rows[0]!;
    return {
      id: s.id as string,
      tenantId: s.tenant_id as string,
      locationId: s.location_id as string,
      tabId: s.tab_id as string,
      orderId: (s.order_id as string) ?? null,
      serverUserId: (s.server_user_id as string) ?? null,
      token: s.token as string,
      status: s.status as string,
      subtotalCents: s.subtotal_cents as number,
      taxCents: s.tax_cents as number,
      serviceChargeCents: s.service_charge_cents as number,
      discountCents: s.discount_cents as number,
      totalCents: s.total_cents as number,
      tipCents: (s.tip_cents as number) ?? null,
      tipPercentage: s.tip_percentage ? Number(s.tip_percentage) : null,
      tableNumber: (s.table_number as string) ?? null,
      partySize: (s.party_size as number) ?? null,
      restaurantName: (s.restaurant_name as string) ?? null,
      expiresAt: new Date(s.expires_at as string).toISOString(),
      paidAt: s.paid_at ? new Date(s.paid_at as string).toISOString() : null,
      supersededById: (s.superseded_by_id as string) ?? null,
      createdAt: new Date(s.created_at as string).toISOString(),
      updatedAt: new Date(s.updated_at as string).toISOString(),
    };
  });
}
