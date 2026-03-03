import type { RequestContext } from '@oppsera/core/auth/context';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import {
  computeReliabilityScore,
  deriveGuestSegment,
} from '../services/guest-profile-aggregator';
import { mapGuestProfile } from '../queries/get-guest-profile';
import type { GuestProfileResult } from '../queries/get-guest-profile';

export interface RefreshGuestProfileInput {
  locationId: string;
  customerId?: string;
  guestPhone?: string;
  guestEmail?: string;
}

/**
 * Recompute a guest profile from historical reservation, waitlist, and tab data.
 *
 * This is a materialization command, not a domain event command — it uses
 * withTenant() directly rather than publishWithOutbox().
 *
 * Aggregates:
 *   - visit_count: completed/seated reservations + seated waitlist entries
 *   - no_show_count: no_show reservations + waitlist no-shows
 *   - cancel_count: canceled reservations + canceled waitlist entries
 *   - total_spend_cents: sum of closed tabs
 *   - avg_ticket_cents: total_spend / tab count
 *   - last_visit_date / first_visit_date: from reservation_date + waitlist business_date
 *   - preferred_tables: most frequent table_id from fnb_table_turn_log
 *   - preferred_server: most frequent server_user_id from closed fnb_tabs
 *
 * Returns null when no matching identifier is provided.
 */
export async function refreshGuestProfile(
  ctx: RequestContext,
  input: RefreshGuestProfileInput,
): Promise<GuestProfileResult | null> {
  const { tenantId } = ctx;
  const { locationId, customerId, guestPhone, guestEmail } = input;

  if (!customerId && !guestPhone && !guestEmail) return null;

  return withTenant(tenantId, async (tx) => {
    // Build identity filter applicable to reservations, waitlist entries, and tabs
    const idParts: ReturnType<typeof sql>[] = [];
    if (customerId) idParts.push(sql`customer_id = ${customerId}`);
    if (guestPhone) idParts.push(sql`guest_phone = ${guestPhone}`);
    if (guestEmail) idParts.push(sql`guest_email = ${guestEmail}`);
    const idFilter = sql.join(idParts, sql` OR `);

    // 1. Aggregate reservation history
    const [resRows, waitlistRows, tabRows, turnLogRows] = await Promise.all([
      // Reservations: count visits, no-shows, cancels, and collect visit dates
      tx.execute(sql`
        SELECT
          status,
          reservation_date AS visit_date
        FROM fnb_reservations
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND (${idFilter})
        ORDER BY reservation_date ASC
      `),

      // Waitlist entries: count seated (visits), no-shows, cancels
      tx.execute(sql`
        SELECT
          status,
          business_date AS visit_date
        FROM fnb_waitlist_entries
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND (${idFilter})
        ORDER BY business_date ASC
      `),

      // Closed tabs: sum spend, find most frequent server.
      // Match on any available identifier (customerId, phone, email) because a
      // guest may have tabs linked only by phone or email if customerId is absent.
      tx.execute(sql`
        SELECT
          total_cents,
          server_user_id
        FROM fnb_tabs
        WHERE tenant_id = ${tenantId}
          AND location_id = ${locationId}
          AND status = 'closed'
          AND (${idFilter})
        ORDER BY closed_at ASC
      `),

      // Table turn log: find most frequent table.
      // Match via reservations using the full identity filter so phone/email guests
      // still get their preferred-table history populated.
      tx.execute(sql`
        SELECT
          r.table_id,
          COUNT(*)::int AS visit_count
        FROM fnb_table_turn_log r
        INNER JOIN fnb_reservations res
          ON res.id = r.reservation_id
          AND res.tenant_id = ${tenantId}
        WHERE r.tenant_id = ${tenantId}
          AND r.location_id = ${locationId}
          AND r.table_id IS NOT NULL
          AND (${idFilter})
        GROUP BY r.table_id
        ORDER BY visit_count DESC
        LIMIT 5
      `),
    ]);

    const reservations = Array.from(resRows as Iterable<Record<string, unknown>>);
    const waitlistEntries = Array.from(waitlistRows as Iterable<Record<string, unknown>>);
    const tabs = Array.from(tabRows as Iterable<Record<string, unknown>>);
    const turnLogs = Array.from(turnLogRows as Iterable<Record<string, unknown>>);

    // 2. Aggregate counts and dates from reservations
    let visitCount = 0;
    let noShowCount = 0;
    let cancelCount = 0;
    const visitDates: string[] = [];

    for (const res of reservations) {
      const status = String(res.status ?? '');
      const date = res.visit_date ? String(res.visit_date).slice(0, 10) : null;

      if (status === 'no_show') {
        noShowCount++;
      } else if (status === 'canceled') {
        cancelCount++;
      } else if (status === 'completed' || status === 'seated') {
        visitCount++;
        if (date) visitDates.push(date);
      }
    }

    // 3. Add waitlist contributions
    for (const entry of waitlistEntries) {
      const status = String(entry.status ?? '');
      const date = entry.visit_date ? String(entry.visit_date).slice(0, 10) : null;

      if (status === 'no_show') {
        noShowCount++;
      } else if (status === 'canceled') {
        cancelCount++;
      } else if (status === 'seated') {
        visitCount++;
        if (date) visitDates.push(date);
      }
    }

    // 4. Compute tab metrics
    let totalSpendCents = 0;
    const serverFrequency = new Map<string, number>();

    for (const tab of tabs) {
      totalSpendCents += Number(tab.total_cents ?? 0);

      if (tab.server_user_id) {
        const sid = String(tab.server_user_id);
        serverFrequency.set(sid, (serverFrequency.get(sid) ?? 0) + 1);
      }
    }

    const tabCount = tabs.length;
    const avgTicketCents = tabCount > 0 ? Math.round(totalSpendCents / tabCount) : null;

    // 5. Derive date range
    const sortedDates = visitDates.slice().sort();
    const firstVisitDate = sortedDates.length > 0 ? sortedDates[0]! : null;
    const lastVisitDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1]! : null;

    // 6. Preferred table from turn log (top by frequency)
    const topTable = turnLogs.length > 0 ? String(turnLogs[0]!.table_id) : null;

    // 7. Preferred server from tabs (highest frequency)
    let preferredServer: string | null = null;
    let maxServerCount = 0;
    for (const [serverId, count] of serverFrequency.entries()) {
      if (count > maxServerCount) {
        maxServerCount = count;
        preferredServer = serverId;
      }
    }

    const reliabilityScore = computeReliabilityScore(visitCount, noShowCount, cancelCount);
    const segment = deriveGuestSegment(visitCount, totalSpendCents);

    // 8. Fetch existing profile to determine guest_name / seating_preference / notes / tags
    //    We preserve identity fields that come from the existing profile if present.
    const existingRows = await tx.execute(sql`
      SELECT id, guest_name, seating_preference, frequent_items, tags, notes
      FROM fnb_guest_profiles
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND (${idFilter})
      LIMIT 1
    `);
    const existing = Array.from(existingRows as Iterable<Record<string, unknown>>)[0] ?? null;

    const profileId = existing ? String(existing.id) : generateUlid();
    const guestName = existing?.guest_name ? String(existing.guest_name) : null;
    const seatingPreference = existing?.seating_preference
      ? String(existing.seating_preference)
      : null;
    const frequentItems = existing?.frequent_items ?? null;
    const tags = existing?.tags ?? null;
    const notes = existing?.notes ? String(existing.notes) : null;

    // 9. Upsert into fnb_guest_profiles using ON CONFLICT on (tenant_id, location_id)
    //    keyed by the best available unique identifier.
    const upsertRows = await tx.execute(sql`
      INSERT INTO fnb_guest_profiles (
        id,
        tenant_id,
        location_id,
        customer_id,
        guest_phone,
        guest_email,
        guest_name,
        visit_count,
        no_show_count,
        cancel_count,
        avg_ticket_cents,
        total_spend_cents,
        last_visit_date,
        first_visit_date,
        preferred_tables,
        preferred_server,
        seating_preference,
        frequent_items,
        tags,
        notes,
        last_computed_at,
        created_at,
        updated_at
      ) VALUES (
        ${profileId},
        ${tenantId},
        ${locationId},
        ${customerId ?? null},
        ${guestPhone ?? null},
        ${guestEmail ?? null},
        ${guestName},
        ${visitCount},
        ${noShowCount},
        ${cancelCount},
        ${avgTicketCents},
        ${totalSpendCents},
        ${lastVisitDate},
        ${firstVisitDate},
        ${topTable},
        ${preferredServer},
        ${seatingPreference},
        ${frequentItems},
        ${tags},
        ${notes},
        now(),
        now(),
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        visit_count       = EXCLUDED.visit_count,
        no_show_count     = EXCLUDED.no_show_count,
        cancel_count      = EXCLUDED.cancel_count,
        avg_ticket_cents  = EXCLUDED.avg_ticket_cents,
        total_spend_cents = EXCLUDED.total_spend_cents,
        last_visit_date   = EXCLUDED.last_visit_date,
        first_visit_date  = EXCLUDED.first_visit_date,
        preferred_tables  = EXCLUDED.preferred_tables,
        preferred_server  = EXCLUDED.preferred_server,
        last_computed_at  = now(),
        updated_at        = now()
      RETURNING *
    `);

    const upserted = Array.from(upsertRows as Iterable<Record<string, unknown>>)[0];
    if (!upserted) return null;

    // Enrich with computed fields before returning
    return {
      ...mapGuestProfile(upserted),
      reliabilityScore,
      segment,
    };
  });
}
