/**
 * Member lookup helpers for Guest Pay member charge flow.
 * Direct SQL — no RLS (guest has no tenant context). Same pattern
 * as all guest pay queries (token-based, globally unique).
 */

import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';

// ── Internal session fetch (adds member fields) ─────────────────

export interface GuestPaySessionInternal {
  id: string;
  tenantId: string;
  locationId: string;
  tabId: string;
  orderId: string | null;
  status: string;
  totalCents: number;
  tipCents: number | null;
  memberId: string | null;
  billingAccountId: string | null;
  memberDisplayName: string | null;
  restaurantName: string | null;
  tableNumber: string | null;
  expiresAt: Date;
}

export async function getSessionInternalByToken(
  token: string,
): Promise<GuestPaySessionInternal | null> {
  const result = await db.execute(
    sql`SELECT id, tenant_id, location_id, tab_id, order_id,
               status, total_cents, tip_cents,
               member_id, billing_account_id, member_display_name,
               restaurant_name, table_number, expires_at
        FROM guest_pay_sessions
        WHERE token = ${token}`,
  );
  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) return null;

  const r = rows[0]!;
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    locationId: r.location_id as string,
    tabId: r.tab_id as string,
    orderId: (r.order_id as string) ?? null,
    status: r.status as string,
    totalCents: r.total_cents as number,
    tipCents: r.tip_cents != null ? (r.tip_cents as number) : null,
    memberId: (r.member_id as string) ?? null,
    billingAccountId: (r.billing_account_id as string) ?? null,
    memberDisplayName: (r.member_display_name as string) ?? null,
    restaurantName: (r.restaurant_name as string) ?? null,
    tableNumber: (r.table_number as string) ?? null,
    expiresAt: new Date(r.expires_at as string),
  };
}

// ── Member lookup by member number + phone last 4 ──────────────

export interface MemberLookupResult {
  customerId: string;
  displayName: string;
  email: string | null;
  billingAccountId: string;
  creditLimitCents: number | null;
  currentBalanceCents: number;
  spendingLimitCents: number | null;
  chargeAllowed: boolean;
  accountStatus: string;
}

export async function lookupMemberForGuestPay(
  tenantId: string,
  memberNumber: string,
  phoneLast4: string,
): Promise<MemberLookupResult | null> {
  // Join: customer_identifiers → customers → billing_account_members → billing_accounts
  // Only match members with active billing accounts that allow charges.
  const result = await db.execute(
    sql`SELECT
          c.id AS customer_id,
          c.display_name,
          c.email,
          c.phone,
          ba.id AS billing_account_id,
          ba.credit_limit_cents,
          ba.current_balance_cents,
          ba.status AS account_status,
          bam.charge_allowed,
          bam.spending_limit_cents
        FROM customer_identifiers ci
        JOIN customers c ON c.id = ci.customer_id AND c.tenant_id = ci.tenant_id
        JOIN billing_account_members bam ON bam.customer_id = c.id AND bam.tenant_id = c.tenant_id
        JOIN billing_accounts ba ON ba.id = bam.billing_account_id AND ba.tenant_id = c.tenant_id
        WHERE ci.tenant_id = ${tenantId}
          AND ci.type = 'member_number'
          AND ci.value = ${memberNumber}
          AND ci.is_active = true
          AND ba.status = 'active'
          AND bam.charge_allowed = true
        LIMIT 1`,
  );
  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) return null;

  const r = rows[0]!;

  // Verify phone last 4 digits match
  const phone = (r.phone as string) ?? '';
  const digitsOnly = phone.replace(/[^0-9]/g, '');
  const last4 = digitsOnly.slice(-4);

  if (last4.length < 4 || last4 !== phoneLast4) {
    return null; // Generic "not found" — no info leak
  }

  return {
    customerId: r.customer_id as string,
    displayName: r.display_name as string,
    email: (r.email as string) ?? null,
    billingAccountId: r.billing_account_id as string,
    creditLimitCents: r.credit_limit_cents != null ? Number(r.credit_limit_cents) : null,
    currentBalanceCents: Number(r.current_balance_cents ?? 0),
    spendingLimitCents: r.spending_limit_cents != null ? Number(r.spending_limit_cents) : null,
    chargeAllowed: r.charge_allowed as boolean,
    accountStatus: r.account_status as string,
  };
}
