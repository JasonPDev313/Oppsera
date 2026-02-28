import type { RequestContext } from '@oppsera/core/auth/context';
import { withTenant } from '@oppsera/db';
import { sql } from 'drizzle-orm';
import type { UpdateHostSettingsInput } from '../validation';

/**
 * Upsert host stand settings for a location.
 */
export async function updateHostSettings(
  ctx: RequestContext,
  input: UpdateHostSettingsInput,
) {
  if (!ctx.locationId) {
    throw new Error('Location ID is required to update host settings');
  }

  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      INSERT INTO fnb_host_settings (
        id, tenant_id, location_id,
        default_turn_time_minutes, wait_time_method, wait_time_buffer_minutes,
        auto_assign_server, rotation_mode, max_wait_minutes, auto_no_show_minutes,
        reservation_slot_interval_minutes, max_party_size, min_advance_hours,
        max_advance_days, default_reservation_duration_minutes,
        require_phone_for_waitlist, require_phone_for_reservation,
        overbooking_percentage, pacing_max_covers_per_slot,
        show_wait_times_to_guests, show_queue_position, floor_plan_default_view
      ) VALUES (
        gen_random_uuid()::text, ${ctx.tenantId}, ${ctx.locationId},
        ${input.defaultTurnTimeMinutes ?? 60},
        ${input.waitTimeMethod ?? 'historical'},
        ${input.waitTimeBufferMinutes ?? 5},
        ${input.autoAssignServer ?? true},
        ${input.rotationMode ?? 'round_robin'},
        ${input.maxWaitMinutes ?? 120},
        ${input.autoNoShowMinutes ?? 15},
        ${input.reservationSlotIntervalMinutes ?? 15},
        ${input.maxPartySize ?? 20},
        ${input.minAdvanceHours ?? 1},
        ${input.maxAdvanceDays ?? 60},
        ${input.defaultReservationDurationMinutes ?? 90},
        ${input.requirePhoneForWaitlist ?? false},
        ${input.requirePhoneForReservation ?? true},
        ${input.overbookingPercentage ?? 0},
        ${input.pacingMaxCoversPerSlot ?? null},
        ${input.showWaitTimesToGuests ?? true},
        ${input.showQueuePosition ?? false},
        ${input.floorPlanDefaultView ?? 'layout'}
      )
      ON CONFLICT (tenant_id, location_id) DO UPDATE SET
        default_turn_time_minutes = COALESCE(${input.defaultTurnTimeMinutes ?? null}, fnb_host_settings.default_turn_time_minutes),
        wait_time_method = COALESCE(${input.waitTimeMethod ?? null}, fnb_host_settings.wait_time_method),
        wait_time_buffer_minutes = COALESCE(${input.waitTimeBufferMinutes ?? null}, fnb_host_settings.wait_time_buffer_minutes),
        auto_assign_server = COALESCE(${input.autoAssignServer ?? null}, fnb_host_settings.auto_assign_server),
        rotation_mode = COALESCE(${input.rotationMode ?? null}, fnb_host_settings.rotation_mode),
        max_wait_minutes = COALESCE(${input.maxWaitMinutes ?? null}, fnb_host_settings.max_wait_minutes),
        auto_no_show_minutes = COALESCE(${input.autoNoShowMinutes ?? null}, fnb_host_settings.auto_no_show_minutes),
        reservation_slot_interval_minutes = COALESCE(${input.reservationSlotIntervalMinutes ?? null}, fnb_host_settings.reservation_slot_interval_minutes),
        max_party_size = COALESCE(${input.maxPartySize ?? null}, fnb_host_settings.max_party_size),
        min_advance_hours = COALESCE(${input.minAdvanceHours ?? null}, fnb_host_settings.min_advance_hours),
        max_advance_days = COALESCE(${input.maxAdvanceDays ?? null}, fnb_host_settings.max_advance_days),
        default_reservation_duration_minutes = COALESCE(${input.defaultReservationDurationMinutes ?? null}, fnb_host_settings.default_reservation_duration_minutes),
        require_phone_for_waitlist = COALESCE(${input.requirePhoneForWaitlist ?? null}, fnb_host_settings.require_phone_for_waitlist),
        require_phone_for_reservation = COALESCE(${input.requirePhoneForReservation ?? null}, fnb_host_settings.require_phone_for_reservation),
        overbooking_percentage = COALESCE(${input.overbookingPercentage ?? null}, fnb_host_settings.overbooking_percentage),
        pacing_max_covers_per_slot = CASE WHEN ${input.pacingMaxCoversPerSlot !== undefined} THEN ${input.pacingMaxCoversPerSlot ?? null} ELSE fnb_host_settings.pacing_max_covers_per_slot END,
        show_wait_times_to_guests = COALESCE(${input.showWaitTimesToGuests ?? null}, fnb_host_settings.show_wait_times_to_guests),
        show_queue_position = COALESCE(${input.showQueuePosition ?? null}, fnb_host_settings.show_queue_position),
        floor_plan_default_view = COALESCE(${input.floorPlanDefaultView ?? null}, fnb_host_settings.floor_plan_default_view),
        updated_at = now()
      RETURNING *
    `);

    const row = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
    return mapSettingsRow(row);
  });
}

function mapSettingsRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    defaultTurnTimeMinutes: Number(row.default_turn_time_minutes),
    waitTimeMethod: String(row.wait_time_method),
    waitTimeBufferMinutes: Number(row.wait_time_buffer_minutes),
    autoAssignServer: Boolean(row.auto_assign_server),
    rotationMode: String(row.rotation_mode),
    maxWaitMinutes: Number(row.max_wait_minutes),
    autoNoShowMinutes: Number(row.auto_no_show_minutes),
    reservationSlotIntervalMinutes: Number(row.reservation_slot_interval_minutes),
    maxPartySize: Number(row.max_party_size),
    minAdvanceHours: Number(row.min_advance_hours),
    maxAdvanceDays: Number(row.max_advance_days),
    defaultReservationDurationMinutes: Number(row.default_reservation_duration_minutes),
    requirePhoneForWaitlist: Boolean(row.require_phone_for_waitlist),
    requirePhoneForReservation: Boolean(row.require_phone_for_reservation),
    overbookingPercentage: Number(row.overbooking_percentage),
    pacingMaxCoversPerSlot: row.pacing_max_covers_per_slot != null ? Number(row.pacing_max_covers_per_slot) : null,
    showWaitTimesToGuests: Boolean(row.show_wait_times_to_guests),
    showQueuePosition: Boolean(row.show_queue_position),
    floorPlanDefaultView: String(row.floor_plan_default_view),
  };
}
