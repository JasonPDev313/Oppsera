import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';

/**
 * Token lookup for guest page. No withTenant — direct query by unique token.
 * Lazily expires the session if past TTL.
 */
export async function getGuestPaySessionByToken(token: string) {
  const sessions = await db.execute(
    sql`SELECT id, tenant_id, location_id, tab_id, order_id,
               status, subtotal_cents, tax_cents, service_charge_cents,
               discount_cents, total_cents, tip_cents,
               tip_settings_snapshot, table_number, party_size,
               restaurant_name, expires_at, paid_at, created_at,
               member_id, member_display_name, billing_account_id
        FROM guest_pay_sessions
        WHERE token = ${token}`,
  );

  const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
  if (rows.length === 0) return null;

  const s = rows[0]!;
  const status = s.status as string;
  const expiresAt = new Date(s.expires_at as string);

  // Lazily expire if past TTL
  if (status === 'active' && expiresAt <= new Date()) {
    await db.execute(
      sql`UPDATE guest_pay_sessions SET status = 'expired', updated_at = NOW()
          WHERE id = ${s.id as string} AND status = 'active'`,
    );
    return {
      id: s.id as string,
      tenantId: s.tenant_id as string,
      orderId: (s.order_id as string) ?? null,
      status: 'expired' as const,
      restaurantName: (s.restaurant_name as string) ?? null,
      tableLabel: s.table_number ? `Table ${s.table_number}` : null,
      subtotalCents: s.subtotal_cents as number,
      taxCents: s.tax_cents as number,
      serviceChargeCents: s.service_charge_cents as number,
      discountCents: s.discount_cents as number,
      totalCents: s.total_cents as number,
      tipCents: (s.tip_cents as number) ?? null,
      tipSettings: (s.tip_settings_snapshot as Record<string, unknown>) ?? null,
      expiresAt: expiresAt.toISOString(),
      paidAt: null,
      memberId: (s.member_id as string) ?? null,
      memberDisplayName: (s.member_display_name as string) ?? null,
      billingAccountId: (s.billing_account_id as string) ?? null,
    };
  }

  return {
    id: s.id as string,
    tenantId: s.tenant_id as string,
    orderId: (s.order_id as string) ?? null,
    status: s.status as string,
    restaurantName: (s.restaurant_name as string) ?? null,
    tableLabel: s.table_number ? `Table ${s.table_number}` : null,
    subtotalCents: s.subtotal_cents as number,
    taxCents: s.tax_cents as number,
    serviceChargeCents: s.service_charge_cents as number,
    discountCents: s.discount_cents as number,
    totalCents: s.total_cents as number,
    tipCents: (s.tip_cents as number) ?? null,
    tipSettings: (s.tip_settings_snapshot as Record<string, unknown>) ?? null,
    expiresAt: expiresAt.toISOString(),
    paidAt: s.paid_at ? new Date(s.paid_at as string).toISOString() : null,
    memberId: (s.member_id as string) ?? null,
    memberDisplayName: (s.member_display_name as string) ?? null,
    billingAccountId: (s.billing_account_id as string) ?? null,
  };
}
