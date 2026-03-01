import { eq, and, asc, isNull } from 'drizzle-orm';
import { withTenant, spaServices, spaServiceCategories } from '@oppsera/db';

export interface ServiceMenuService {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  category: string;
  durationMinutes: number;
  bufferMinutes: number;
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
  imageUrl: string | null;
  sortOrder: number;
}

export interface ServiceMenuCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  services: ServiceMenuService[];
}

export interface ServiceMenu {
  categories: ServiceMenuCategory[];
}

/**
 * Returns the full service menu organized by category.
 * Only includes active services (archivedAt IS NULL, isActive = true).
 * Only includes active categories (isActive = true).
 * Used by the booking widget and POS.
 */
export async function getServiceMenu(
  tenantId: string,
  _locationId?: string,
): Promise<ServiceMenu> {
  return withTenant(tenantId, async (tx) => {
    // Fetch all active categories and services in parallel
    const [categoryRows, serviceRows] = await Promise.all([
      tx
        .select({
          id: spaServiceCategories.id,
          name: spaServiceCategories.name,
          description: spaServiceCategories.description,
          icon: spaServiceCategories.icon,
          parentId: spaServiceCategories.parentId,
          sortOrder: spaServiceCategories.sortOrder,
        })
        .from(spaServiceCategories)
        .where(
          and(
            eq(spaServiceCategories.tenantId, tenantId),
            eq(spaServiceCategories.isActive, true),
          ),
        )
        .orderBy(asc(spaServiceCategories.sortOrder), asc(spaServiceCategories.name)),

      tx
        .select({
          id: spaServices.id,
          name: spaServices.name,
          displayName: spaServices.displayName,
          description: spaServices.description,
          category: spaServices.category,
          categoryId: spaServices.categoryId,
          durationMinutes: spaServices.durationMinutes,
          bufferMinutes: spaServices.bufferMinutes,
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
          imageUrl: spaServices.imageUrl,
          sortOrder: spaServices.sortOrder,
        })
        .from(spaServices)
        .where(
          and(
            eq(spaServices.tenantId, tenantId),
            eq(spaServices.isActive, true),
            isNull(spaServices.archivedAt),
          ),
        )
        .orderBy(asc(spaServices.sortOrder), asc(spaServices.name)),
    ]);

    // Group services by categoryId
    const servicesByCategoryId = new Map<string, ServiceMenuService[]>();
    const uncategorizedServices: ServiceMenuService[] = [];

    for (const s of serviceRows) {
      const mapped: ServiceMenuService = {
        id: s.id,
        name: s.name,
        displayName: s.displayName ?? null,
        description: s.description ?? null,
        category: s.category,
        durationMinutes: s.durationMinutes,
        bufferMinutes: s.bufferMinutes,
        price: s.price,
        memberPrice: s.memberPrice ?? null,
        peakPrice: s.peakPrice ?? null,
        maxCapacity: s.maxCapacity,
        isCouples: s.isCouples,
        isGroup: s.isGroup,
        minGroupSize: s.minGroupSize ?? null,
        maxGroupSize: s.maxGroupSize ?? null,
        requiresIntake: s.requiresIntake,
        requiresConsent: s.requiresConsent,
        imageUrl: s.imageUrl ?? null,
        sortOrder: s.sortOrder,
      };

      if (s.categoryId) {
        const existing = servicesByCategoryId.get(s.categoryId);
        if (existing) {
          existing.push(mapped);
        } else {
          servicesByCategoryId.set(s.categoryId, [mapped]);
        }
      } else {
        uncategorizedServices.push(mapped);
      }
    }

    // Build categories with their services (only include categories that have services)
    const categories: ServiceMenuCategory[] = [];

    for (const cat of categoryRows) {
      const services = servicesByCategoryId.get(cat.id) ?? [];
      if (services.length > 0) {
        categories.push({
          id: cat.id,
          name: cat.name,
          description: cat.description ?? null,
          icon: cat.icon ?? null,
          parentId: cat.parentId ?? null,
          sortOrder: cat.sortOrder,
          services,
        });
      }
    }

    // Add uncategorized services under a virtual category if any exist
    if (uncategorizedServices.length > 0) {
      categories.push({
        id: '__uncategorized__',
        name: 'Other Services',
        description: null,
        icon: null,
        parentId: null,
        sortOrder: 999999,
        services: uncategorizedServices,
      });
    }

    return { categories };
  });
}
