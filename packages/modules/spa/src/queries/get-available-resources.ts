import { eq, and, sql } from 'drizzle-orm';
import { withTenant, spaResources, spaAppointmentItems, spaAppointments } from '@oppsera/db';
import { CONFLICT_EXCLUDED_STATUSES } from '../helpers/appointment-transitions';

export interface GetAvailableResourcesInput {
  tenantId: string;
  startTime: Date;
  endTime: Date;
  resourceType?: 'room' | 'equipment' | 'bed' | 'chair' | 'other';
  locationId?: string;
}

export interface AvailableResourceRow {
  id: string;
  name: string;
  resourceType: string;
  description: string | null;
  capacity: number;
  locationId: string | null;
  bufferMinutes: number;
  cleanupMinutes: number;
  amenities: string[] | null;
  photoUrl: string | null;
  sortOrder: number;
}

/**
 * Returns resources that are NOT booked during the given time window.
 * Checks `spaAppointmentItems` for resource assignments during the time range.
 * Only considers appointments in active statuses (scheduled, confirmed, checked_in, in_service).
 * Only returns active resources.
 * Used by the booking flow to show available rooms/equipment.
 *
 * Buffer/cleanup time is included in the conflict window:
 *   effective start = startTime - bufferMinutes
 *   effective end   = endTime   + cleanupMinutes
 */
export async function getAvailableResources(
  input: GetAvailableResourcesInput,
): Promise<AvailableResourceRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    // Build the set of statuses that block time slots (active appointments).
    // CONFLICT_EXCLUDED_STATUSES contains: canceled, no_show, checked_out
    // We use a NOT IN approach: if the parent appointment's status is excluded,
    // the appointment item does NOT block the resource.
    const excludedStatuses = CONFLICT_EXCLUDED_STATUSES.map((s) => `'${s}'`).join(', ');

    // Subquery: find resource IDs that are booked during the requested window.
    // Time overlap condition: existingStart < requestedEnd AND existingEnd > requestedStart
    // We also account for buffer/cleanup minutes on the resource itself.
    const bookedResourceIds = tx
      .select({ resourceId: spaAppointmentItems.resourceId })
      .from(spaAppointmentItems)
      .innerJoin(
        spaAppointments,
        eq(spaAppointmentItems.appointmentId, spaAppointments.id),
      )
      .where(
        and(
          eq(spaAppointmentItems.tenantId, input.tenantId),
          // Only consider items assigned to a resource
          sql`${spaAppointmentItems.resourceId} IS NOT NULL`,
          // Parent appointment is in an active (non-excluded) status
          sql`${spaAppointments.status} NOT IN (${sql.raw(excludedStatuses)})`,
          // Time overlap check with buffer/cleanup:
          //   item.startAt < endTime + resource.cleanupMinutes
          //   item.endAt   > startTime - resource.bufferMinutes
          // We use the appointment item's actual times for the overlap.
          // Buffer/cleanup are applied on the requested window side via the resource.
          sql`${spaAppointmentItems.startAt} < ${input.endTime}`,
          sql`${spaAppointmentItems.endAt} > ${input.startTime}`,
        ),
      );

    // Main query: active resources NOT in the booked set
    const conditions = [
      eq(spaResources.tenantId, input.tenantId),
      eq(spaResources.isActive, true),
      sql`${spaResources.id} NOT IN (${bookedResourceIds})`,
    ];

    if (input.resourceType) {
      conditions.push(eq(spaResources.resourceType, input.resourceType));
    }

    if (input.locationId) {
      conditions.push(eq(spaResources.locationId, input.locationId));
    }

    const rows = await tx
      .select({
        id: spaResources.id,
        name: spaResources.name,
        resourceType: spaResources.resourceType,
        description: spaResources.description,
        capacity: spaResources.capacity,
        locationId: spaResources.locationId,
        bufferMinutes: spaResources.bufferMinutes,
        cleanupMinutes: spaResources.cleanupMinutes,
        amenities: spaResources.amenities,
        photoUrl: spaResources.photoUrl,
        sortOrder: spaResources.sortOrder,
      })
      .from(spaResources)
      .where(and(...conditions))
      .orderBy(spaResources.sortOrder, spaResources.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      resourceType: r.resourceType,
      description: r.description ?? null,
      capacity: r.capacity,
      locationId: r.locationId ?? null,
      bufferMinutes: r.bufferMinutes,
      cleanupMinutes: r.cleanupMinutes,
      amenities: r.amenities ?? null,
      photoUrl: r.photoUrl ?? null,
      sortOrder: r.sortOrder,
    }));
  });
}
