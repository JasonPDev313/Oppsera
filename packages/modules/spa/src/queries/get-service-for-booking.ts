import { eq, and } from 'drizzle-orm';
import {
  withTenant,
  spaServices,
  spaProviderServiceEligibility,
  spaProviders,
  spaServiceResourceRequirements,
  spaResources,
} from '@oppsera/db';

export interface BookingEligibleProvider {
  providerId: string;
  displayName: string;
  photoUrl: string | null;
  proficiencyLevel: string;
  customDurationMinutes: number | null;
  customPrice: string | null;
  isBookableOnline: boolean;
  acceptNewClients: boolean;
  color: string | null;
  sortOrder: number;
}

export interface BookingResourceRequirement {
  id: string;
  resourceId: string | null;
  resourceType: string | null;
  resourceName: string | null;
  resourceCapacity: number | null;
  quantity: number;
  isMandatory: boolean;
}

export interface ServiceForBooking {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  category: string;
  durationMinutes: number;
  bufferMinutes: number;
  cleanupMinutes: number;
  setupMinutes: number;
  /** Total time blocked on the calendar = setup + duration + cleanup + buffer */
  totalBlockMinutes: number;
  price: string;
  memberPrice: string | null;
  peakPrice: string | null;
  maxCapacity: number;
  isCouples: boolean;
  isGroup: boolean;
  minGroupSize: number | null;
  maxGroupSize: number | null;
  requiresIntake: boolean;
  requiresConsent: boolean;
  contraindications: string[] | null;
  preparationInstructions: string | null;
  imageUrl: string | null;
  eligibleProviders: BookingEligibleProvider[];
  resourceRequirements: BookingResourceRequirement[];
}

/**
 * Returns a service with all booking-relevant data.
 * Includes: duration, buffer, prep/cleanup time, price, deposit requirement.
 * Includes: eligible providers (from spaProviderServiceEligibility).
 * Includes: required resources (from spaServiceResourceRequirements).
 * Used by availability engine and booking flow.
 * Returns null if not found or archived.
 */
export async function getServiceForBooking(
  tenantId: string,
  serviceId: string,
): Promise<ServiceForBooking | null> {
  return withTenant(tenantId, async (tx) => {
    // Fetch the service
    const [service] = await tx
      .select({
        id: spaServices.id,
        name: spaServices.name,
        displayName: spaServices.displayName,
        description: spaServices.description,
        category: spaServices.category,
        durationMinutes: spaServices.durationMinutes,
        bufferMinutes: spaServices.bufferMinutes,
        cleanupMinutes: spaServices.cleanupMinutes,
        setupMinutes: spaServices.setupMinutes,
        price: spaServices.price,
        memberPrice: spaServices.memberPrice,
        peakPrice: spaServices.peakPrice,
        maxCapacity: spaServices.maxCapacity,
        isCouples: spaServices.isCouples,
        isGroup: spaServices.isGroup,
        minGroupSize: spaServices.minGroupSize,
        maxGroupSize: spaServices.maxGroupSize,
        requiresIntake: spaServices.requiresIntake,
        requiresConsent: spaServices.requiresConsent,
        contraindications: spaServices.contraindications,
        preparationInstructions: spaServices.preparationInstructions,
        imageUrl: spaServices.imageUrl,
        isActive: spaServices.isActive,
        archivedAt: spaServices.archivedAt,
      })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, serviceId),
          eq(spaServices.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!service || !service.isActive || service.archivedAt) {
      return null;
    }

    // Fetch eligible providers and resource requirements in parallel
    const [providerRows, resourceRows] = await Promise.all([
      tx
        .select({
          providerId: spaProviderServiceEligibility.providerId,
          displayName: spaProviders.displayName,
          photoUrl: spaProviders.photoUrl,
          proficiencyLevel: spaProviderServiceEligibility.proficiencyLevel,
          customDurationMinutes: spaProviderServiceEligibility.customDurationMinutes,
          customPrice: spaProviderServiceEligibility.customPrice,
          isBookableOnline: spaProviders.isBookableOnline,
          acceptNewClients: spaProviders.acceptNewClients,
          color: spaProviders.color,
          sortOrder: spaProviders.sortOrder,
        })
        .from(spaProviderServiceEligibility)
        .innerJoin(
          spaProviders,
          eq(spaProviderServiceEligibility.providerId, spaProviders.id),
        )
        .where(
          and(
            eq(spaProviderServiceEligibility.serviceId, serviceId),
            eq(spaProviderServiceEligibility.tenantId, tenantId),
            eq(spaProviders.isActive, true),
          ),
        ),

      tx
        .select({
          id: spaServiceResourceRequirements.id,
          resourceId: spaServiceResourceRequirements.resourceId,
          resourceType: spaServiceResourceRequirements.resourceType,
          resourceName: spaResources.name,
          resourceCapacity: spaResources.capacity,
          quantity: spaServiceResourceRequirements.quantity,
          isMandatory: spaServiceResourceRequirements.isMandatory,
        })
        .from(spaServiceResourceRequirements)
        .leftJoin(
          spaResources,
          eq(spaServiceResourceRequirements.resourceId, spaResources.id),
        )
        .where(
          and(
            eq(spaServiceResourceRequirements.serviceId, serviceId),
            eq(spaServiceResourceRequirements.tenantId, tenantId),
          ),
        ),
    ]);

    const eligibleProviders: BookingEligibleProvider[] = providerRows.map((p) => ({
      providerId: p.providerId,
      displayName: p.displayName,
      photoUrl: p.photoUrl ?? null,
      proficiencyLevel: p.proficiencyLevel,
      customDurationMinutes: p.customDurationMinutes ?? null,
      customPrice: p.customPrice ?? null,
      isBookableOnline: p.isBookableOnline,
      acceptNewClients: p.acceptNewClients,
      color: p.color ?? null,
      sortOrder: p.sortOrder,
    }));

    const resourceRequirements: BookingResourceRequirement[] = resourceRows.map((r) => ({
      id: r.id,
      resourceId: r.resourceId ?? null,
      resourceType: r.resourceType ?? null,
      resourceName: r.resourceName ?? null,
      resourceCapacity: r.resourceCapacity ?? null,
      quantity: r.quantity,
      isMandatory: r.isMandatory,
    }));

    const totalBlockMinutes =
      service.setupMinutes + service.durationMinutes + service.cleanupMinutes + service.bufferMinutes;

    return {
      id: service.id,
      name: service.name,
      displayName: service.displayName ?? null,
      description: service.description ?? null,
      category: service.category,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      cleanupMinutes: service.cleanupMinutes,
      setupMinutes: service.setupMinutes,
      totalBlockMinutes,
      price: service.price,
      memberPrice: service.memberPrice ?? null,
      peakPrice: service.peakPrice ?? null,
      maxCapacity: service.maxCapacity,
      isCouples: service.isCouples,
      isGroup: service.isGroup,
      minGroupSize: service.minGroupSize ?? null,
      maxGroupSize: service.maxGroupSize ?? null,
      requiresIntake: service.requiresIntake,
      requiresConsent: service.requiresConsent,
      contraindications: (service.contraindications as string[]) ?? null,
      preparationInstructions: service.preparationInstructions ?? null,
      imageUrl: service.imageUrl ?? null,
      eligibleProviders,
      resourceRequirements,
    };
  });
}
