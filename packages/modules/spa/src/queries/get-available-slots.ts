import {
  getAvailableSlots as engineGetAvailableSlots,
  type AvailableSlot,
} from '../helpers/availability-engine';

export type { AvailableSlot };

export interface GetAvailableSlotsInput {
  tenantId: string;
  locationId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  providerId?: string;
}

export interface AvailableSlotsByProvider {
  providerId: string;
  providerName: string;
  slots: Array<{
    startTime: Date;
    endTime: Date;
    resourceId: string | null;
    resourceName: string | null;
  }>;
}

export interface GetAvailableSlotsResult {
  date: string;
  serviceId: string;
  providers: AvailableSlotsByProvider[];
  totalSlots: number;
}

/**
 * Get available time slots for a specific service on a specific date.
 * Delegates to the availability engine for computation.
 * Returns slots grouped by provider for easy rendering.
 * Used by both internal booking UI and public booking widget.
 */
export async function getAvailableSlots(
  input: GetAvailableSlotsInput,
): Promise<GetAvailableSlotsResult> {
  // Delegate to the availability engine with same-day start/end
  const rawSlots = await engineGetAvailableSlots({
    tenantId: input.tenantId,
    serviceId: input.serviceId,
    startDate: input.date,
    endDate: input.date,
    providerId: input.providerId,
    locationId: input.locationId,
  });

  // Group slots by provider for calendar/booking UI
  const providerMap = new Map<
    string,
    {
      providerName: string;
      slots: Array<{
        startTime: Date;
        endTime: Date;
        resourceId: string | null;
        resourceName: string | null;
      }>;
    }
  >();

  for (const slot of rawSlots) {
    const existing = providerMap.get(slot.providerId);
    const slotEntry = {
      startTime: slot.startTime,
      endTime: slot.endTime,
      resourceId: slot.resourceId ?? null,
      resourceName: slot.resourceName ?? null,
    };

    if (existing) {
      existing.slots.push(slotEntry);
    } else {
      providerMap.set(slot.providerId, {
        providerName: slot.providerName,
        slots: [slotEntry],
      });
    }
  }

  const providers: AvailableSlotsByProvider[] = [];
  for (const [providerId, data] of providerMap) {
    providers.push({
      providerId,
      providerName: data.providerName,
      slots: data.slots,
    });
  }

  // Sort providers by name for consistent ordering
  providers.sort((a, b) => a.providerName.localeCompare(b.providerName));

  return {
    date: input.date,
    serviceId: input.serviceId,
    providers,
    totalSlots: rawSlots.length,
  };
}
