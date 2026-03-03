// ── Consumer: Table Available → Auto-promote Waitlist ─────────────────────
// Triggered by fnb.table.status_changed.v1 and fnb.table.auto_progressed.v1
// when toStatus === 'available'.
//
// Safety guarantees:
//  - Race-condition guard: re-reads table live status inside withTenant
//  - Reservation hold guard: skips if a reservation is within 30 min
//  - All errors are logged but never re-thrown (business ops must complete)

import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  rankWaitlistForTable,
} from '../services/waitlist-promoter';
import type {
  WaitlistEntryForPromotion,
  TableForPromotion,
} from '../services/waitlist-promoter';

// ── Public Types ──────────────────────────────────────────────────────────

export interface TableAvailableEventData {
  tenantId: string;
  locationId: string;
  tableId: string;
  fromStatus: string;
  toStatus: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Do not auto-promote if a reservation starts within this many minutes */
const RESERVATION_HOLD_MINUTES = 30;

/** Minimum valid offer expiry — guard against zero/negative from corrupt settings */
const MIN_OFFER_EXPIRY_MINUTES = 1;

/** Default offer expiry when no host settings are available */
const DEFAULT_OFFER_EXPIRY_MINUTES = 10;

// ── Consumer ─────────────────────────────────────────────────────────────

/**
 * When a table transitions to 'available', attempt to auto-offer it to the
 * best-matching party on the waitlist.
 *
 * Steps:
 *  1. Guard: only act on toStatus === 'available'
 *  2. Read table info + current live status (race guard)
 *  3. Check for upcoming reservations within 30 min
 *  4. Fetch active waitlist entries + host settings
 *  5. Call rankWaitlistForTable() to get the ranked list
 *  6. Offer the top match: set offered_table_id / offered_at / offer_expires_at
 *  7. Insert an fnb_guest_notifications row (type='table_ready', status='pending')
 *  8. Log but swallow any error
 */
export async function handleTableAvailableForWaitlist(
  data: TableAvailableEventData,
): Promise<void> {
  // ── Guard 1: only react to 'available' ─────────────────────────────────
  if (data.toStatus !== 'available') return;

  try {
    await withTenant(data.tenantId, async (tx) => {

      // ── Step 2: Read table info + current live status ─────────────────
      const tableRows = await tx.execute(sql`
        SELECT
          t.id,
          t.capacity_min,
          t.capacity_max,
          t.table_type,
          t.section_id,
          ls.status AS live_status
        FROM fnb_tables t
        INNER JOIN fnb_table_live_status ls ON ls.table_id = t.id
          AND ls.tenant_id = t.tenant_id
        WHERE t.id       = ${data.tableId}
          AND t.tenant_id = ${data.tenantId}
          AND t.location_id = ${data.locationId}
        LIMIT 1
      `);
      const tableArr = Array.from(tableRows as Iterable<Record<string, unknown>>);
      if (tableArr.length === 0) return; // table not found — nothing to do

      const tableRow = tableArr[0]!;

      // ── Guard 2: Race condition — table may have been taken already ──
      if (String(tableRow.live_status) !== 'available') return;

      const table: TableForPromotion = {
        id: data.tableId,
        capacityMin: Number(tableRow.capacity_min),
        capacityMax: Number(tableRow.capacity_max),
        tableType: String(tableRow.table_type),
        sectionId: tableRow.section_id ? String(tableRow.section_id) : null,
      };

      // ── Step 3: Check for upcoming reservations within 30 min ───────
      const reservationRows = await tx.execute(sql`
        SELECT id
        FROM fnb_reservations
        WHERE tenant_id = ${data.tenantId}
          AND location_id = ${data.locationId}
          AND status IN ('booked', 'confirmed', 'checked_in')
          AND (
            table_ids @> ${JSON.stringify([data.tableId])}::jsonb
            OR assigned_table_id = ${data.tableId}
          )
          AND (
            reservation_date::date = CURRENT_DATE
            AND reservation_time::time <= (NOW() + (${RESERVATION_HOLD_MINUTES} || ' minutes')::interval)::time
            AND reservation_time::time >= (NOW() - INTERVAL '15 minutes')::time
          )
        LIMIT 1
      `);
      const reservationArr = Array.from(reservationRows as Iterable<Record<string, unknown>>);
      if (reservationArr.length > 0) return; // table is needed for a reservation

      // ── Step 4: Read host settings for this location ─────────────────
      const settingsRows = await tx.execute(sql`
        SELECT settings
        FROM fnb_host_settings
        WHERE tenant_id   = ${data.tenantId}
          AND location_id = ${data.locationId}
        LIMIT 1
      `);
      const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
      let offerExpiryMinutes = DEFAULT_OFFER_EXPIRY_MINUTES;
      let priorityEnabled = false;

      if (settingsArr.length > 0 && settingsArr[0]!.settings) {
        try {
          const rawSettings =
            typeof settingsArr[0]!.settings === 'string'
              ? JSON.parse(String(settingsArr[0]!.settings))
              : (settingsArr[0]!.settings as Record<string, unknown>);
          const waitlistSettings = (rawSettings as Record<string, unknown>).waitlist as Record<string, unknown> | undefined;
          if (waitlistSettings) {
            if (typeof waitlistSettings.notifyExpiryMinutes === 'number' && waitlistSettings.notifyExpiryMinutes > 0) {
              offerExpiryMinutes = waitlistSettings.notifyExpiryMinutes;
            }
            if (typeof waitlistSettings.priorityEnabled === 'boolean') {
              priorityEnabled = waitlistSettings.priorityEnabled;
            }
          }
        } catch {
          // Corrupt settings — use defaults
        }
      }

      // ── Step 5: Fetch active waitlist entries ─────────────────────────
      const entryRows = await tx.execute(sql`
        SELECT
          id,
          party_size,
          priority,
          is_vip,
          seating_preference,
          added_at,
          status,
          offer_declined_count,
          offered_table_id,
          offer_expires_at
        FROM fnb_waitlist_entries
        WHERE tenant_id   = ${data.tenantId}
          AND location_id = ${data.locationId}
          AND business_date = CURRENT_DATE::text
          AND status IN ('waiting', 'notified')
        ORDER BY priority DESC, added_at ASC
      `);
      const entryArr = Array.from(entryRows as Iterable<Record<string, unknown>>);
      if (entryArr.length === 0) return; // nobody waiting

      const entries: WaitlistEntryForPromotion[] = entryArr.map((row) => ({
        id: String(row.id),
        partySize: Number(row.party_size),
        priority: Number(row.priority ?? 0),
        isVip: Boolean(row.is_vip),
        seatingPreference: row.seating_preference ? String(row.seating_preference) : null,
        addedAt: String(row.added_at),
        status: String(row.status),
        offerDeclinedCount: Number(row.offer_declined_count ?? 0),
        offeredTableId: row.offered_table_id ? String(row.offered_table_id) : null,
        offerExpiresAt: row.offer_expires_at ? String(row.offer_expires_at) : null,
      }));

      // ── Step 6: Rank and select top match ────────────────────────────
      const matches = rankWaitlistForTable(entries, table, { priorityEnabled });
      if (matches.length === 0) return; // no eligible parties

      const topMatch = matches[0]!;

      // Guard against zero/negative expiry from misconfigured settings
      const safeExpiryMinutes = Math.max(offerExpiryMinutes, MIN_OFFER_EXPIRY_MINUTES);

      // ── Step 7: Write the offer and advance status to 'notified' ─────
      // Status is set to 'notified' so the entry is not re-offered on the
      // next event firing (the filter in rankWaitlistForTable still includes
      // 'notified' entries, but their live offer blocks re-promotion).
      const offerRows = await tx.execute(sql`
        UPDATE fnb_waitlist_entries
        SET
          status            = 'notified',
          offered_table_id  = ${data.tableId},
          offered_at        = now(),
          offer_expires_at  = now() + (${safeExpiryMinutes} || ' minutes')::interval,
          notified_at       = now(),
          updated_at        = now()
        WHERE id        = ${topMatch.entryId}
          AND tenant_id = ${data.tenantId}
          AND status IN ('waiting', 'notified')
        RETURNING id, guest_phone, guest_name, party_size
      `);
      const offerArr = Array.from(offerRows as Iterable<Record<string, unknown>>);
      if (offerArr.length === 0) return; // entry disappeared — race condition

      const offeredEntry = offerArr[0]!;

      // ── Step 8: Insert guest notification ────────────────────────────
      await tx.execute(sql`
        INSERT INTO fnb_guest_notifications (
          id, tenant_id, location_id,
          reference_type, reference_id,
          notification_type, channel,
          recipient_phone, message_body,
          status, sent_at
        ) VALUES (
          gen_random_uuid()::text,
          ${data.tenantId},
          ${data.locationId},
          'waitlist',
          ${topMatch.entryId},
          'table_ready',
          'sms',
          ${offeredEntry.guest_phone ? String(offeredEntry.guest_phone) : null},
          ${'Your table is ready! Please check in within ' + offerExpiryMinutes + ' minutes.'},
          'pending',
          now()
        )
      `);
    });
  } catch (err) {
    // Never re-throw — this consumer must not block the triggering operation.
    // In production, structured logging would capture this for alerting.
    console.error('[handleTableAvailableForWaitlist] Error during auto-promotion:', err);
  }
}
