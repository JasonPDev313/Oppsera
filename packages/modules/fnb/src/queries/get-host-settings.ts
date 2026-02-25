import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface HostSettings {
  id: string | null;
  locationId: string;
  defaultWaitQuoteMinutes: number;
  autoQuoteEnabled: boolean;
  rotationMode: string;
  maxPartySize: number;
  enableVipPriority: boolean;
  enableSmsNotifications: boolean;
  smsProvider: string | null;
  smsFromNumber: string | null;
  smsNotifyTemplate: string | null;
  smsConfirmTemplate: string | null;
  enableOnlineWaitlist: boolean;
  enableOnlineReservations: boolean;
  reservationSlotIntervalMinutes: number;
  defaultReservationDurationMinutes: number;
  maxAdvanceBookingDays: number;
  requirePhoneForWaitlist: boolean;
  requirePhoneForReservation: boolean;
  autoSeatFromWaitlist: boolean;
  noShowWindowMinutes: number;
}

const DEFAULTS: HostSettings = {
  id: null,
  locationId: '',
  defaultWaitQuoteMinutes: 15,
  autoQuoteEnabled: false,
  rotationMode: 'round_robin',
  maxPartySize: 20,
  enableVipPriority: true,
  enableSmsNotifications: false,
  smsProvider: null,
  smsFromNumber: null,
  smsNotifyTemplate: null,
  smsConfirmTemplate: null,
  enableOnlineWaitlist: false,
  enableOnlineReservations: false,
  reservationSlotIntervalMinutes: 15,
  defaultReservationDurationMinutes: 90,
  maxAdvanceBookingDays: 30,
  requirePhoneForWaitlist: false,
  requirePhoneForReservation: true,
  autoSeatFromWaitlist: false,
  noShowWindowMinutes: 15,
};

export async function getHostSettings(
  tenantId: string,
  locationId: string,
): Promise<HostSettings> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT *
      FROM fnb_host_settings
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
      LIMIT 1
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0];

    if (!row) {
      return { ...DEFAULTS, locationId };
    }

    return {
      id: String(row.id),
      locationId: String(row.location_id),
      defaultWaitQuoteMinutes: Number(row.default_wait_quote_minutes ?? 15),
      autoQuoteEnabled: Boolean(row.auto_quote_enabled),
      rotationMode: String(row.rotation_mode ?? 'round_robin'),
      maxPartySize: Number(row.max_party_size ?? 20),
      enableVipPriority: Boolean(row.enable_vip_priority),
      enableSmsNotifications: Boolean(row.enable_sms_notifications),
      smsProvider: row.sms_provider ? String(row.sms_provider) : null,
      smsFromNumber: row.sms_from_number ? String(row.sms_from_number) : null,
      smsNotifyTemplate: row.sms_notify_template ? String(row.sms_notify_template) : null,
      smsConfirmTemplate: row.sms_confirm_template ? String(row.sms_confirm_template) : null,
      enableOnlineWaitlist: Boolean(row.enable_online_waitlist),
      enableOnlineReservations: Boolean(row.enable_online_reservations),
      reservationSlotIntervalMinutes: Number(row.reservation_slot_interval_minutes ?? 15),
      defaultReservationDurationMinutes: Number(row.default_reservation_duration_minutes ?? 90),
      maxAdvanceBookingDays: Number(row.max_advance_booking_days ?? 30),
      requirePhoneForWaitlist: Boolean(row.require_phone_for_waitlist),
      requirePhoneForReservation: Boolean(row.require_phone_for_reservation),
      autoSeatFromWaitlist: Boolean(row.auto_seat_from_waitlist),
      noShowWindowMinutes: Number(row.no_show_window_minutes ?? 15),
    };
  });
}
