import { eq, and } from 'drizzle-orm';
import { withTenant, spaServices, catalogItems } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

/**
 * Resolves the catalog item ID for a spa service.
 *
 * 1. Checks spaServices.catalogItemId for the service
 * 2. If null, looks for a fallback item with SKU 'SPA-FALLBACK'
 * 3. If neither exists, throws with a clear error
 */
export async function resolveCatalogItemForSpaService(
  tenantId: string,
  serviceId: string,
): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    // Check if the service has a linked catalog item
    const [service] = await tx
      .select({ catalogItemId: spaServices.catalogItemId })
      .from(spaServices)
      .where(
        and(
          eq(spaServices.tenantId, tenantId),
          eq(spaServices.id, serviceId),
        ),
      )
      .limit(1);

    if (!service) {
      throw new AppError('NOT_FOUND', `Spa service not found: ${serviceId}`, 404);
    }

    if (service.catalogItemId) {
      return service.catalogItemId;
    }

    // Fallback: look for a generic SPA-FALLBACK catalog item
    const [fallback] = await tx
      .select({ id: catalogItems.id })
      .from(catalogItems)
      .where(
        and(
          eq(catalogItems.tenantId, tenantId),
          eq(catalogItems.sku, 'SPA-FALLBACK'),
        ),
      )
      .limit(1);

    if (fallback) {
      return fallback.id;
    }

    throw new AppError(
      'CONFIGURATION_ERROR',
      `Spa service "${serviceId}" has no linked catalog item and no SPA-FALLBACK item exists. ` +
        'Link spa services to catalog items in Settings, or create a catalog item with SKU "SPA-FALLBACK".',
      422,
    );
  });
}
