import { eq, and, asc } from 'drizzle-orm';
import {
  withTenant,
  spaServiceAddons,
  spaServiceAddonLinks,
} from '@oppsera/db';

export interface ServiceAddonRow {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string;
  memberPrice: string | null;
  isStandalone: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Only populated when querying by serviceId */
  isDefault: boolean | null;
  /** Only populated when querying by serviceId */
  priceOverride: string | null;
}

/**
 * Returns service addons.
 * - If serviceId provided, returns addons linked to that service (via junction table)
 *   including link-specific fields (isDefault, priceOverride).
 * - If no serviceId, returns all addons for tenant.
 * Ordered by sortOrder.
 */
export async function listServiceAddons(
  tenantId: string,
  serviceId?: string,
): Promise<ServiceAddonRow[]> {
  return withTenant(tenantId, async (tx) => {
    if (serviceId) {
      // Fetch addons linked to a specific service
      const rows = await tx
        .select({
          id: spaServiceAddons.id,
          name: spaServiceAddons.name,
          description: spaServiceAddons.description,
          durationMinutes: spaServiceAddons.durationMinutes,
          price: spaServiceAddons.price,
          memberPrice: spaServiceAddons.memberPrice,
          isStandalone: spaServiceAddons.isStandalone,
          sortOrder: spaServiceAddons.sortOrder,
          isActive: spaServiceAddons.isActive,
          createdAt: spaServiceAddons.createdAt,
          updatedAt: spaServiceAddons.updatedAt,
          isDefault: spaServiceAddonLinks.isDefault,
          priceOverride: spaServiceAddonLinks.priceOverride,
        })
        .from(spaServiceAddonLinks)
        .innerJoin(spaServiceAddons, eq(spaServiceAddonLinks.addonId, spaServiceAddons.id))
        .where(
          and(
            eq(spaServiceAddonLinks.tenantId, tenantId),
            eq(spaServiceAddonLinks.serviceId, serviceId),
          ),
        )
        .orderBy(asc(spaServiceAddons.sortOrder));

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        durationMinutes: r.durationMinutes,
        price: r.price,
        memberPrice: r.memberPrice ?? null,
        isStandalone: r.isStandalone,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        isDefault: r.isDefault,
        priceOverride: r.priceOverride ?? null,
      }));
    }

    // No serviceId — return all addons for the tenant
    const rows = await tx
      .select({
        id: spaServiceAddons.id,
        name: spaServiceAddons.name,
        description: spaServiceAddons.description,
        durationMinutes: spaServiceAddons.durationMinutes,
        price: spaServiceAddons.price,
        memberPrice: spaServiceAddons.memberPrice,
        isStandalone: spaServiceAddons.isStandalone,
        sortOrder: spaServiceAddons.sortOrder,
        isActive: spaServiceAddons.isActive,
        createdAt: spaServiceAddons.createdAt,
        updatedAt: spaServiceAddons.updatedAt,
      })
      .from(spaServiceAddons)
      .where(eq(spaServiceAddons.tenantId, tenantId))
      .orderBy(asc(spaServiceAddons.sortOrder));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      durationMinutes: r.durationMinutes,
      price: r.price,
      memberPrice: r.memberPrice ?? null,
      isStandalone: r.isStandalone,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isDefault: null,
      priceOverride: null,
    }));
  });
}
