import { eq, and } from 'drizzle-orm';
import {
  withTenant,
  spaProviderServiceEligibility,
  spaServices,
} from '@oppsera/db';

export interface ProviderEligibilityRow {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  durationMinutes: number;
  price: string;
  proficiencyLevel: string;
  customDurationMinutes: number | null;
  customPrice: string | null;
}

/**
 * Get the list of services a provider is eligible to perform.
 * Joins with spa_services for service name, category, duration, and price.
 */
export async function getProviderEligibility(
  tenantId: string,
  providerId: string,
): Promise<ProviderEligibilityRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: spaProviderServiceEligibility.id,
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
      );

    return rows.map((row) => ({
      id: row.id,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      serviceCategory: row.serviceCategory,
      durationMinutes: row.durationMinutes,
      price: row.price,
      proficiencyLevel: row.proficiencyLevel,
      customDurationMinutes: row.customDurationMinutes ?? null,
      customPrice: row.customPrice ?? null,
    }));
  });
}
