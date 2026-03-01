import { eq, and, lt, ilike, or, desc, sql } from 'drizzle-orm';
import {
  withTenant,
  spaProviders,
  spaProviderServiceEligibility,
} from '@oppsera/db';

export interface ListProvidersInput {
  tenantId: string;
  locationId?: string;
  serviceId?: string;
  isActive?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ProviderListRow {
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
  serviceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListProvidersResult {
  items: ProviderListRow[];
  cursor: string | null;
  hasMore: boolean;
}

export async function listProviders(input: ListProvidersInput): Promise<ListProvidersResult> {
  const limit = Math.min(input.limit ?? 50, 100);

  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof eq>[] = [eq(spaProviders.tenantId, input.tenantId)];

    if (input.cursor) {
      conditions.push(lt(spaProviders.id, input.cursor));
    }

    if (input.isActive !== undefined) {
      conditions.push(eq(spaProviders.isActive, input.isActive));
    }

    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          ilike(spaProviders.displayName, pattern),
          ilike(spaProviders.bio, pattern),
        )!,
      );
    }

    // If filtering by serviceId, only return providers eligible for that service
    if (input.serviceId) {
      const eligibleProviderIds = tx
        .select({ providerId: spaProviderServiceEligibility.providerId })
        .from(spaProviderServiceEligibility)
        .where(
          and(
            eq(spaProviderServiceEligibility.tenantId, input.tenantId),
            eq(spaProviderServiceEligibility.serviceId, input.serviceId),
          ),
        );

      conditions.push(
        sql`${spaProviders.id} IN (${eligibleProviderIds})`,
      );
    }

    // If filtering by locationId, only return providers who have availability at that location
    // This is a soft filter — providers without any availability still appear if no locationId
    if (input.locationId) {
      // We don't hard-filter by location since providers may work at multiple locations.
      // The caller should use the availability query for stricter location filtering.
      // This keeps the list query simple and performant.
    }

    // Subquery for service count
    const serviceCountSq = sql<number>`(
      SELECT COUNT(*)::int
      FROM spa_provider_service_eligibility pse
      WHERE pse.tenant_id = ${input.tenantId}
        AND pse.provider_id = ${spaProviders.id}
    )`.as('service_count');

    const rows = await tx
      .select({
        id: spaProviders.id,
        tenantId: spaProviders.tenantId,
        userId: spaProviders.userId,
        displayName: spaProviders.displayName,
        bio: spaProviders.bio,
        photoUrl: spaProviders.photoUrl,
        specialties: spaProviders.specialties,
        certifications: spaProviders.certifications,
        hireDate: spaProviders.hireDate,
        employmentType: spaProviders.employmentType,
        isBookableOnline: spaProviders.isBookableOnline,
        acceptNewClients: spaProviders.acceptNewClients,
        maxDailyAppointments: spaProviders.maxDailyAppointments,
        breakDurationMinutes: spaProviders.breakDurationMinutes,
        color: spaProviders.color,
        sortOrder: spaProviders.sortOrder,
        isActive: spaProviders.isActive,
        createdAt: spaProviders.createdAt,
        updatedAt: spaProviders.updatedAt,
        serviceCount: serviceCountSq,
      })
      .from(spaProviders)
      .where(and(...conditions))
      .orderBy(desc(spaProviders.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const mapped: ProviderListRow[] = items.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      displayName: row.displayName,
      bio: row.bio ?? null,
      photoUrl: row.photoUrl ?? null,
      specialties: (row.specialties as string[] | null) ?? null,
      certifications: (row.certifications as Array<{ name: string; issuer?: string; expiresAt?: string }> | null) ?? null,
      hireDate: row.hireDate ?? null,
      employmentType: row.employmentType,
      isBookableOnline: row.isBookableOnline,
      acceptNewClients: row.acceptNewClients,
      maxDailyAppointments: row.maxDailyAppointments ?? null,
      breakDurationMinutes: row.breakDurationMinutes,
      color: row.color ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      serviceCount: Number(row.serviceCount) || 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return {
      items: mapped,
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}
