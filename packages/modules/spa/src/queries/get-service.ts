import { eq, and, asc } from 'drizzle-orm';
import {
  withTenant,
  spaServices,
  spaServiceCategories,
  spaServiceAddonLinks,
  spaServiceAddons,
  spaServiceResourceRequirements,
  spaResources,
} from '@oppsera/db';

export interface ServiceAddonLink {
  id: string;
  addonId: string;
  addonName: string;
  addonDescription: string | null;
  addonDurationMinutes: number;
  addonPrice: string;
  addonMemberPrice: string | null;
  isDefault: boolean;
  priceOverride: string | null;
  isStandalone: boolean;
  sortOrder: number;
}

export interface ServiceResourceRequirement {
  id: string;
  resourceId: string | null;
  resourceType: string | null;
  resourceName: string | null;
  quantity: number;
  isMandatory: boolean;
}

export interface ServiceDetail {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  category: string;
  categoryId: string | null;
  categoryName: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  cleanupMinutes: number;
  setupMinutes: number;
  price: string;
  memberPrice: string | null;
  peakPrice: string | null;
  cost: string | null;
  maxCapacity: number;
  isCouples: boolean;
  isGroup: boolean;
  minGroupSize: number | null;
  maxGroupSize: number | null;
  requiresIntake: boolean;
  requiresConsent: boolean;
  contraindications: string[] | null;
  preparationInstructions: string | null;
  aftercareInstructions: string | null;
  catalogItemId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  archivedBy: string | null;
  archivedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  addonLinks: ServiceAddonLink[];
  resourceRequirements: ServiceResourceRequirement[];
}

/**
 * Returns a single service with full details including category info,
 * addon links, and resource requirements.
 * Uses parallel queries inside withTenant for efficiency.
 * Returns null if not found.
 */
export async function getService(
  tenantId: string,
  serviceId: string,
): Promise<ServiceDetail | null> {
  return withTenant(tenantId, async (tx) => {
    // Fetch service with category JOIN
    const [row] = await tx
      .select({
        id: spaServices.id,
        name: spaServices.name,
        displayName: spaServices.displayName,
        description: spaServices.description,
        category: spaServices.category,
        categoryId: spaServices.categoryId,
        categoryName: spaServiceCategories.name,
        durationMinutes: spaServices.durationMinutes,
        bufferMinutes: spaServices.bufferMinutes,
        cleanupMinutes: spaServices.cleanupMinutes,
        setupMinutes: spaServices.setupMinutes,
        price: spaServices.price,
        memberPrice: spaServices.memberPrice,
        peakPrice: spaServices.peakPrice,
        cost: spaServices.cost,
        maxCapacity: spaServices.maxCapacity,
        isCouples: spaServices.isCouples,
        isGroup: spaServices.isGroup,
        minGroupSize: spaServices.minGroupSize,
        maxGroupSize: spaServices.maxGroupSize,
        requiresIntake: spaServices.requiresIntake,
        requiresConsent: spaServices.requiresConsent,
        contraindications: spaServices.contraindications,
        preparationInstructions: spaServices.preparationInstructions,
        aftercareInstructions: spaServices.aftercareInstructions,
        catalogItemId: spaServices.catalogItemId,
        imageUrl: spaServices.imageUrl,
        sortOrder: spaServices.sortOrder,
        isActive: spaServices.isActive,
        archivedAt: spaServices.archivedAt,
        archivedBy: spaServices.archivedBy,
        archivedReason: spaServices.archivedReason,
        createdAt: spaServices.createdAt,
        updatedAt: spaServices.updatedAt,
        createdBy: spaServices.createdBy,
      })
      .from(spaServices)
      .leftJoin(spaServiceCategories, eq(spaServices.categoryId, spaServiceCategories.id))
      .where(and(eq(spaServices.id, serviceId), eq(spaServices.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      return null;
    }

    // Fetch addon links and resource requirements in parallel
    const [addonLinkRows, resourceReqRows] = await Promise.all([
      tx
        .select({
          id: spaServiceAddonLinks.id,
          addonId: spaServiceAddonLinks.addonId,
          addonName: spaServiceAddons.name,
          addonDescription: spaServiceAddons.description,
          addonDurationMinutes: spaServiceAddons.durationMinutes,
          addonPrice: spaServiceAddons.price,
          addonMemberPrice: spaServiceAddons.memberPrice,
          isDefault: spaServiceAddonLinks.isDefault,
          priceOverride: spaServiceAddonLinks.priceOverride,
          isStandalone: spaServiceAddons.isStandalone,
          addonSortOrder: spaServiceAddons.sortOrder,
        })
        .from(spaServiceAddonLinks)
        .innerJoin(spaServiceAddons, eq(spaServiceAddonLinks.addonId, spaServiceAddons.id))
        .where(
          and(
            eq(spaServiceAddonLinks.serviceId, serviceId),
            eq(spaServiceAddonLinks.tenantId, tenantId),
          ),
        )
        .orderBy(asc(spaServiceAddons.sortOrder)),

      tx
        .select({
          id: spaServiceResourceRequirements.id,
          resourceId: spaServiceResourceRequirements.resourceId,
          resourceType: spaServiceResourceRequirements.resourceType,
          resourceName: spaResources.name,
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

    const addonLinks: ServiceAddonLink[] = addonLinkRows.map((a) => ({
      id: a.id,
      addonId: a.addonId,
      addonName: a.addonName,
      addonDescription: a.addonDescription ?? null,
      addonDurationMinutes: a.addonDurationMinutes,
      addonPrice: a.addonPrice,
      addonMemberPrice: a.addonMemberPrice ?? null,
      isDefault: a.isDefault,
      priceOverride: a.priceOverride ?? null,
      isStandalone: a.isStandalone,
      sortOrder: a.addonSortOrder,
    }));

    const resourceRequirements: ServiceResourceRequirement[] = resourceReqRows.map((r) => ({
      id: r.id,
      resourceId: r.resourceId ?? null,
      resourceType: r.resourceType ?? null,
      resourceName: r.resourceName ?? null,
      quantity: r.quantity,
      isMandatory: r.isMandatory,
    }));

    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName ?? null,
      description: row.description ?? null,
      category: row.category,
      categoryId: row.categoryId ?? null,
      categoryName: row.categoryName ?? null,
      durationMinutes: row.durationMinutes,
      bufferMinutes: row.bufferMinutes,
      cleanupMinutes: row.cleanupMinutes,
      setupMinutes: row.setupMinutes,
      price: row.price,
      memberPrice: row.memberPrice ?? null,
      peakPrice: row.peakPrice ?? null,
      cost: row.cost ?? null,
      maxCapacity: row.maxCapacity,
      isCouples: row.isCouples,
      isGroup: row.isGroup,
      minGroupSize: row.minGroupSize ?? null,
      maxGroupSize: row.maxGroupSize ?? null,
      requiresIntake: row.requiresIntake,
      requiresConsent: row.requiresConsent,
      contraindications: (row.contraindications as string[]) ?? null,
      preparationInstructions: row.preparationInstructions ?? null,
      aftercareInstructions: row.aftercareInstructions ?? null,
      catalogItemId: row.catalogItemId ?? null,
      imageUrl: row.imageUrl ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      archivedAt: row.archivedAt ?? null,
      archivedBy: row.archivedBy ?? null,
      archivedReason: row.archivedReason ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy ?? null,
      addonLinks,
      resourceRequirements,
    };
  });
}
