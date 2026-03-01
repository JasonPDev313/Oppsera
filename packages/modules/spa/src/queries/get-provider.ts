import { eq, and, gte, sql } from 'drizzle-orm';
import {
  withTenant,
  spaProviders,
  spaProviderAvailability,
  spaProviderTimeOff,
  spaProviderServiceEligibility,
  spaServices,
} from '@oppsera/db';

export interface ProviderAvailabilitySlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  locationId: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}

export interface ProviderTimeOffEntry {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  isAllDay: boolean;
  status: string;
  approvedBy: string | null;
  approvedAt: Date | null;
}

export interface ProviderEligibleService {
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  durationMinutes: number;
  price: string;
  proficiencyLevel: string;
  customDurationMinutes: number | null;
  customPrice: string | null;
}

export interface ProviderDetail {
  id: string;
  tenantId: string;
  userId: string;
  displayName: string;
  bio: string | null;
  photoUrl: string | null;
  specialties: string[] | null;
  certifications: Array<{ name: string; issuer?: string; expiresAt?: string }> | null;
  hireDate: string | null;
  employmentType: string;
  isBookableOnline: boolean;
  acceptNewClients: boolean;
  maxDailyAppointments: number | null;
  breakDurationMinutes: number;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  availability: ProviderAvailabilitySlot[];
  upcomingTimeOff: ProviderTimeOffEntry[];
  eligibleServices: ProviderEligibleService[];
}

/**
 * Get a provider with full details: availability template, upcoming time-off,
 * and eligible services. Uses Promise.all for parallel sub-queries.
 */
export async function getProvider(
  tenantId: string,
  providerId: string,
): Promise<ProviderDetail | null> {
  return withTenant(tenantId, async (tx) => {
    // Fetch the provider
    const [provider] = await tx
      .select()
      .from(spaProviders)
      .where(
        and(
          eq(spaProviders.id, providerId),
          eq(spaProviders.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!provider) {
      return null;
    }

    const now = new Date();

    // Parallel sub-queries for availability, time-off, and eligibility
    const [availabilityRows, timeOffRows, eligibilityRows] = await Promise.all([
      // Availability template
      tx
        .select({
          id: spaProviderAvailability.id,
          dayOfWeek: spaProviderAvailability.dayOfWeek,
          startTime: spaProviderAvailability.startTime,
          endTime: spaProviderAvailability.endTime,
          locationId: spaProviderAvailability.locationId,
          effectiveFrom: spaProviderAvailability.effectiveFrom,
          effectiveUntil: spaProviderAvailability.effectiveUntil,
          isActive: spaProviderAvailability.isActive,
        })
        .from(spaProviderAvailability)
        .where(
          and(
            eq(spaProviderAvailability.tenantId, tenantId),
            eq(spaProviderAvailability.providerId, providerId),
            eq(spaProviderAvailability.isActive, true),
          ),
        ),

      // Upcoming time-off (endAt >= now, exclude rejected)
      tx
        .select({
          id: spaProviderTimeOff.id,
          startAt: spaProviderTimeOff.startAt,
          endAt: spaProviderTimeOff.endAt,
          reason: spaProviderTimeOff.reason,
          isAllDay: spaProviderTimeOff.isAllDay,
          status: spaProviderTimeOff.status,
          approvedBy: spaProviderTimeOff.approvedBy,
          approvedAt: spaProviderTimeOff.approvedAt,
        })
        .from(spaProviderTimeOff)
        .where(
          and(
            eq(spaProviderTimeOff.tenantId, tenantId),
            eq(spaProviderTimeOff.providerId, providerId),
            gte(spaProviderTimeOff.endAt, now),
            sql`${spaProviderTimeOff.status} != 'rejected'`,
          ),
        ),

      // Eligible services (joined with spa_services for name, category, etc.)
      tx
        .select({
          serviceId: spaProviderServiceEligibility.serviceId,
          serviceName: spaServices.name,
          serviceCategory: spaServices.category,
          durationMinutes: spaServices.durationMinutes,
          price: spaServices.price,
          proficiencyLevel: spaProviderServiceEligibility.proficiencyLevel,
          customDurationMinutes: spaProviderServiceEligibility.customDurationMinutes,
          customPrice: spaProviderServiceEligibility.customPrice,
        })
        .from(spaProviderServiceEligibility)
        .innerJoin(
          spaServices,
          and(
            eq(spaServices.id, spaProviderServiceEligibility.serviceId),
            eq(spaServices.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(spaProviderServiceEligibility.tenantId, tenantId),
            eq(spaProviderServiceEligibility.providerId, providerId),
          ),
        ),
    ]);

    const availability: ProviderAvailabilitySlot[] = availabilityRows.map((row) => ({
      id: row.id,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      locationId: row.locationId ?? null,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil ?? null,
      isActive: row.isActive,
    }));

    const upcomingTimeOff: ProviderTimeOffEntry[] = timeOffRows.map((row) => ({
      id: row.id,
      startAt: row.startAt,
      endAt: row.endAt,
      reason: row.reason ?? null,
      isAllDay: row.isAllDay,
      status: row.status,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt ?? null,
    }));

    const eligibleServices: ProviderEligibleService[] = eligibilityRows.map((row) => ({
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      serviceCategory: row.serviceCategory,
      durationMinutes: row.durationMinutes,
      price: row.price,
      proficiencyLevel: row.proficiencyLevel,
      customDurationMinutes: row.customDurationMinutes ?? null,
      customPrice: row.customPrice ?? null,
    }));

    return {
      id: provider.id,
      tenantId: provider.tenantId,
      userId: provider.userId,
      displayName: provider.displayName,
      bio: provider.bio ?? null,
      photoUrl: provider.photoUrl ?? null,
      specialties: (provider.specialties as string[] | null) ?? null,
      certifications: (provider.certifications as Array<{ name: string; issuer?: string; expiresAt?: string }> | null) ?? null,
      hireDate: provider.hireDate ?? null,
      employmentType: provider.employmentType,
      isBookableOnline: provider.isBookableOnline,
      acceptNewClients: provider.acceptNewClients,
      maxDailyAppointments: provider.maxDailyAppointments ?? null,
      breakDurationMinutes: provider.breakDurationMinutes,
      color: provider.color ?? null,
      sortOrder: provider.sortOrder,
      isActive: provider.isActive,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      availability,
      upcomingTimeOff,
      eligibleServices,
    };
  });
}
