import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { aggregateGuestProfile } from '../services/guest-profile-aggregator';
import type { GuestReservationData, GuestTabData } from '../services/guest-profile-aggregator';

export interface HandleGuestProfileUpdateData {
  tenantId: string;
  locationId: string;
  customerId?: string;
  guestPhone?: string;
  guestEmail?: string;
  guestName?: string;
}

/**
 * Consumer for fnb.tab.closed.v1 and fnb.reservation.status_changed.v1 events.
 *
 * Looks up or creates a guest profile by (customerId → phone → email),
 * then fetches all reservation and tab data for this guest and recomputes
 * the aggregated profile using aggregateGuestProfile().
 *
 * GL adapters never throw — errors are swallowed to protect business operations.
 */
export async function handleGuestProfileUpdate(
  data: HandleGuestProfileUpdateData,
): Promise<void> {
  // Consumers must never throw — errors are swallowed to protect business operations.
  try {
  const { tenantId, locationId, customerId, guestPhone, guestEmail, guestName } = data;

  // At least one identifier is required to look up/create a profile
  if (!customerId && !guestPhone && !guestEmail) return;

  await withTenant(tenantId, async (tx) => {
    // ── 1. Look up existing profile ──────────────────────────────────
    let profileId: string | null = null;

    // Priority: customerId > phone > email
    if (customerId) {
      const rows = await tx.execute(sql`
        SELECT id FROM fnb_guest_profiles
        WHERE tenant_id = ${tenantId}
          AND customer_id = ${customerId}
        LIMIT 1
      `);
      const hit = Array.from(rows as Iterable<Record<string, unknown>>)[0];
      if (hit) profileId = String(hit.id);
    }

    if (!profileId && guestPhone) {
      const rows = await tx.execute(sql`
        SELECT id FROM fnb_guest_profiles
        WHERE tenant_id = ${tenantId}
          AND guest_phone = ${guestPhone}
        LIMIT 1
      `);
      const hit = Array.from(rows as Iterable<Record<string, unknown>>)[0];
      if (hit) profileId = String(hit.id);
    }

    if (!profileId && guestEmail) {
      const rows = await tx.execute(sql`
        SELECT id FROM fnb_guest_profiles
        WHERE tenant_id = ${tenantId}
          AND guest_email = ${guestEmail}
        LIMIT 1
      `);
      const hit = Array.from(rows as Iterable<Record<string, unknown>>)[0];
      if (hit) profileId = String(hit.id);
    }

    // ── 2. Create stub profile if none found ─────────────────────────
    if (!profileId) {
      profileId = generateUlid();
      await tx.execute(sql`
        INSERT INTO fnb_guest_profiles (
          id, tenant_id, location_id, customer_id,
          guest_phone, guest_email, guest_name,
          created_at, updated_at, last_computed_at
        ) VALUES (
          ${profileId}, ${tenantId}, ${locationId},
          ${customerId ?? null}, ${guestPhone ?? null}, ${guestEmail ?? null},
          ${guestName ?? null},
          NOW(), NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
      `);
    }

    // ── 3. Fetch reservation history for this guest ──────────────────
    // Match on any available identifier
    const identifierFilter = sql`(
      ${customerId ? sql`customer_id = ${customerId}` : sql`false`}
      OR ${guestPhone ? sql`guest_phone = ${guestPhone}` : sql`false`}
      OR ${guestEmail ? sql`guest_email = ${guestEmail}` : sql`false`}
    )`;

    const [reservationRows, tabRows] = await Promise.all([
      tx.execute(sql`
        SELECT
          status,
          reservation_date AS date,
          assigned_table_id AS table_id,
          party_size,
          seating_preference
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND ${identifierFilter}
        ORDER BY reservation_date DESC
        LIMIT 500
      `),

      tx.execute(sql`
        SELECT
          t.id,
          t.total_cents,
          t.table_id,
          t.server_user_id,
          COALESCE(
            json_agg(
              json_build_object(
                'catalogItemId', ci.catalog_item_id,
                'name', ci.name,
                'qty', ci.qty
              )
            ) FILTER (WHERE ci.catalog_item_id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM fnb_tabs t
        LEFT JOIN fnb_check_items ci ON ci.tab_id = t.id AND ci.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${tenantId}
          AND t.status = 'closed'
          AND (
            ${customerId ? sql`t.customer_id = ${customerId}` : sql`false`}
            OR ${guestPhone ? sql`t.guest_phone = ${guestPhone}` : sql`false`}
            OR ${guestEmail ? sql`t.guest_email = ${guestEmail}` : sql`false`}
          )
        GROUP BY t.id, t.total_cents, t.table_id, t.server_user_id
        ORDER BY t.closed_at DESC
        LIMIT 500
      `),
    ]);

    // ── 4. Map raw rows to typed input ────────────────────────────────
    const reservations: GuestReservationData[] = Array.from(
      reservationRows as Iterable<Record<string, unknown>>,
    ).map((row) => ({
      status: String(row.status),
      date: String(row.date),
      tableId: row.table_id ? String(row.table_id) : undefined,
      partySize: Number(row.party_size ?? 1),
      seatingPreference: row.seating_preference ? String(row.seating_preference) : undefined,
    }));

    const tabs: GuestTabData[] = Array.from(
      tabRows as Iterable<Record<string, unknown>>,
    ).map((row) => {
      let items: Array<{ catalogItemId: string; name: string; qty: number }> = [];
      try {
        const raw = row.items;
        if (Array.isArray(raw)) {
          items = raw.map((i: Record<string, unknown>) => ({
            catalogItemId: String(i.catalogItemId ?? ''),
            name: String(i.name ?? ''),
            qty: Number(i.qty ?? 0),
          }));
        }
      } catch {
        // ignore malformed items
      }
      return {
        totalCents: Number(row.total_cents ?? 0),
        items,
        tableId: row.table_id ? String(row.table_id) : undefined,
        serverUserId: row.server_user_id ? String(row.server_user_id) : undefined,
      };
    });

    // ── 5. Recompute profile ──────────────────────────────────────────
    const profile = aggregateGuestProfile(reservations, tabs);

    const frequentItemsJson = JSON.stringify(profile.frequentItems);

    // ── 6. Upsert computed values back to profile ─────────────────────
    await tx.execute(sql`
      UPDATE fnb_guest_profiles
      SET
        guest_name       = COALESCE(${guestName ?? null}, guest_name),
        guest_phone      = COALESCE(${guestPhone ?? null}, guest_phone),
        guest_email      = COALESCE(${guestEmail ?? null}, guest_email),
        customer_id      = COALESCE(${customerId ?? null}, customer_id),
        visit_count      = ${profile.visitCount},
        no_show_count    = ${profile.noShowCount},
        cancel_count     = ${profile.cancelCount},
        avg_ticket_cents = ${profile.avgTicketCents},
        total_spend_cents = ${profile.totalSpendCents},
        last_visit_date  = ${profile.lastVisitDate ?? null},
        first_visit_date = ${profile.firstVisitDate ?? null},
        preferred_tables = ${profile.preferredTables || null},
        preferred_server = ${profile.preferredServer ?? null},
        frequent_items   = ${frequentItemsJson}::jsonb,
        last_computed_at = NOW(),
        updated_at       = NOW()
      WHERE id = ${profileId}
    `);
  });
  } catch (err) {
    // Intentionally swallowed — guest profile update failures must never surface
    // to callers or block the business operation that triggered this consumer.
    console.error('[handleGuestProfileUpdate] failed to update guest profile', err);
  }
}
