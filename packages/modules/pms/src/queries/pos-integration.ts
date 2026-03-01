// ── PMS ↔ POS Integration Queries ─────────────────────────────────
// Optimized queries for the POS hot path — search checked-in guests,
// get folio summaries, room number lookups.

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { PosGuestResult, PosFolioSummary } from '@oppsera/core';

// ── 1. Search checked-in guests by name or room number ──────────

export async function searchCheckedInGuestsForPOS(
  tenantId: string,
  query: string,
  locationId?: string,
): Promise<PosGuestResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return withTenant(tenantId, async (tx) => {
    // Search by room number (exact) OR guest name (ILIKE)
    const conditions = [
      sql`r.status = 'CHECKED_IN'`,
    ];

    if (locationId) {
      conditions.push(sql`p.location_id = ${locationId}`);
    }

    // Room number exact match OR name partial match
    const searchCondition = sql`(
      rm.room_number = ${trimmed}
      OR g.first_name ILIKE ${'%' + trimmed + '%'}
      OR g.last_name ILIKE ${'%' + trimmed + '%'}
      OR (g.first_name || ' ' || g.last_name) ILIKE ${'%' + trimmed + '%'}
    )`;
    conditions.push(searchCondition);

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute<{
      guest_id: string;
      first_name: string;
      last_name: string;
      room_number: string;
      reservation_id: string;
      folio_id: string | null;
      is_vip: boolean;
      check_in_date: string;
      check_out_date: string;
    }>(sql`
      SELECT
        g.id AS guest_id,
        g.first_name,
        g.last_name,
        COALESCE(rm.room_number, '') AS room_number,
        r.id AS reservation_id,
        f.id AS folio_id,
        g.is_vip,
        r.check_in_date::text AS check_in_date,
        r.check_out_date::text AS check_out_date
      FROM pms_reservations r
      JOIN pms_guests g ON g.id = r.guest_id AND g.tenant_id = r.tenant_id
      JOIN pms_properties p ON p.id = r.property_id AND p.tenant_id = r.tenant_id
      LEFT JOIN pms_rooms rm ON rm.id = r.room_id AND rm.tenant_id = r.tenant_id
      LEFT JOIN pms_folios f ON f.reservation_id = r.id AND f.tenant_id = r.tenant_id AND f.status = 'OPEN'
      WHERE ${whereClause}
      ORDER BY g.last_name ASC, g.first_name ASC
      LIMIT 20
    `);

    return Array.from(rows as Iterable<typeof rows extends Iterable<infer U> ? U : never>).map((r) => ({
      guestId: r.guest_id,
      firstName: r.first_name,
      lastName: r.last_name,
      roomNumber: r.room_number,
      reservationId: r.reservation_id,
      folioId: r.folio_id ?? null,
      isVip: r.is_vip,
      checkInDate: r.check_in_date,
      checkOutDate: r.check_out_date,
    }));
  });
}

// ── 2. Exact room number lookup ──────────────────────────────────

export async function getCheckedInGuestByRoom(
  tenantId: string,
  roomNumber: string,
  locationId?: string,
): Promise<PosGuestResult | null> {
  const trimmed = roomNumber.trim();
  if (!trimmed) return null;

  return withTenant(tenantId, async (tx) => {
    const conditions = [
      sql`r.status = 'CHECKED_IN'`,
      sql`rm.room_number = ${trimmed}`,
    ];

    if (locationId) {
      conditions.push(sql`p.location_id = ${locationId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute<{
      guest_id: string;
      first_name: string;
      last_name: string;
      room_number: string;
      reservation_id: string;
      folio_id: string | null;
      is_vip: boolean;
      check_in_date: string;
      check_out_date: string;
    }>(sql`
      SELECT
        g.id AS guest_id,
        g.first_name,
        g.last_name,
        rm.room_number,
        r.id AS reservation_id,
        f.id AS folio_id,
        g.is_vip,
        r.check_in_date::text AS check_in_date,
        r.check_out_date::text AS check_out_date
      FROM pms_reservations r
      JOIN pms_guests g ON g.id = r.guest_id AND g.tenant_id = r.tenant_id
      JOIN pms_properties p ON p.id = r.property_id AND p.tenant_id = r.tenant_id
      JOIN pms_rooms rm ON rm.id = r.room_id AND rm.tenant_id = r.tenant_id
      LEFT JOIN pms_folios f ON f.reservation_id = r.id AND f.tenant_id = r.tenant_id AND f.status = 'OPEN'
      WHERE ${whereClause}
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<typeof rows extends Iterable<infer U> ? U : never>);
    if (arr.length === 0) return null;

    const r = arr[0]!;
    return {
      guestId: r.guest_id,
      firstName: r.first_name,
      lastName: r.last_name,
      roomNumber: r.room_number,
      reservationId: r.reservation_id,
      folioId: r.folio_id ?? null,
      isVip: r.is_vip,
      checkInDate: r.check_in_date,
      checkOutDate: r.check_out_date,
    };
  });
}

// ── 3. Get active folio for a checked-in guest ───────────────────

export async function getActiveFolioForGuest(
  tenantId: string,
  guestId: string,
): Promise<PosFolioSummary | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{
      folio_id: string;
      guest_id: string;
      first_name: string;
      last_name: string;
      room_number: string;
      reservation_id: string;
      balance_cents: number;
      total_cents: number;
      payment_cents: number;
      status: string;
      check_in_date: string;
      check_out_date: string;
    }>(sql`
      SELECT
        f.id AS folio_id,
        g.id AS guest_id,
        g.first_name,
        g.last_name,
        COALESCE(rm.room_number, '') AS room_number,
        r.id AS reservation_id,
        f.balance_cents,
        f.total_cents,
        f.payment_cents,
        f.status,
        r.check_in_date::text AS check_in_date,
        r.check_out_date::text AS check_out_date
      FROM pms_folios f
      JOIN pms_reservations r ON r.id = f.reservation_id AND r.tenant_id = f.tenant_id
      JOIN pms_guests g ON g.id = f.guest_id AND g.tenant_id = f.tenant_id
      LEFT JOIN pms_rooms rm ON rm.id = r.room_id AND rm.tenant_id = r.tenant_id
      WHERE f.tenant_id = (select current_setting('app.current_tenant_id', true))
        AND f.guest_id = ${guestId}
        AND f.status = 'OPEN'
        AND r.status = 'CHECKED_IN'
      ORDER BY f.created_at DESC
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<typeof rows extends Iterable<infer U> ? U : never>);
    if (arr.length === 0) return null;

    const r = arr[0]!;
    return {
      folioId: r.folio_id,
      guestId: r.guest_id,
      guestName: `${r.first_name} ${r.last_name}`,
      roomNumber: r.room_number,
      reservationId: r.reservation_id,
      balanceCents: r.balance_cents,
      totalCents: r.total_cents,
      paymentCents: r.payment_cents,
      status: r.status,
      checkInDate: r.check_in_date,
      checkOutDate: r.check_out_date,
    };
  });
}

// ── 4. Get folio summary by folio ID ─────────────────────────────

export async function getFolioSummaryForPOS(
  tenantId: string,
  folioId: string,
): Promise<PosFolioSummary | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{
      folio_id: string;
      guest_id: string;
      first_name: string;
      last_name: string;
      room_number: string;
      reservation_id: string;
      balance_cents: number;
      total_cents: number;
      payment_cents: number;
      status: string;
      check_in_date: string;
      check_out_date: string;
    }>(sql`
      SELECT
        f.id AS folio_id,
        COALESCE(g.id, '') AS guest_id,
        COALESCE(g.first_name, '') AS first_name,
        COALESCE(g.last_name, '') AS last_name,
        COALESCE(rm.room_number, '') AS room_number,
        r.id AS reservation_id,
        f.balance_cents,
        f.total_cents,
        f.payment_cents,
        f.status,
        r.check_in_date::text AS check_in_date,
        r.check_out_date::text AS check_out_date
      FROM pms_folios f
      JOIN pms_reservations r ON r.id = f.reservation_id AND r.tenant_id = f.tenant_id
      LEFT JOIN pms_guests g ON g.id = f.guest_id AND g.tenant_id = f.tenant_id
      LEFT JOIN pms_rooms rm ON rm.id = r.room_id AND rm.tenant_id = r.tenant_id
      WHERE f.tenant_id = (select current_setting('app.current_tenant_id', true))
        AND f.id = ${folioId}
      LIMIT 1
    `);

    const arr = Array.from(rows as Iterable<typeof rows extends Iterable<infer U> ? U : never>);
    if (arr.length === 0) return null;

    const r = arr[0]!;
    return {
      folioId: r.folio_id,
      guestId: r.guest_id,
      guestName: `${r.first_name} ${r.last_name}`.trim(),
      roomNumber: r.room_number,
      reservationId: r.reservation_id,
      balanceCents: r.balance_cents,
      totalCents: r.total_cents,
      paymentCents: r.payment_cents,
      status: r.status,
      checkInDate: r.check_in_date,
      checkOutDate: r.check_out_date,
    };
  });
}
