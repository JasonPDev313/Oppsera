import { eq, and } from 'drizzle-orm';
import { createAdminClient, tenants, spaSettings, spaBookingWidgetConfig } from '@oppsera/db';

/**
 * Resolves a tenant by slug and validates spa online booking is enabled.
 *
 * Returns the tenant ID, location ID (from first active booking config),
 * and the full booking widget config if the tenant exists and has online
 * booking enabled. Returns null if the tenant doesn't exist, is not active,
 * or doesn't have online booking enabled.
 *
 * This runs OUTSIDE withTenant() — public routes do not have RLS context.
 * The slug column has a UNIQUE index so this is a fast lookup.
 */
export interface ResolvedTenant {
  tenantId: string;
  tenantName: string;
  locationId: string | null;
}

export async function resolveTenantBySlug(
  slug: string,
): Promise<ResolvedTenant | null> {
  // Public route — no RLS tenant context available.
  // Use admin client to bypass FORCE ROW LEVEL SECURITY on tenants / spa_settings.
  const adminDb = createAdminClient();

  // Look up tenant by slug
  const [tenant] = await adminDb
    .select({
      id: tenants.id,
      name: tenants.name,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!tenant || tenant.status !== 'active') {
    return null;
  }

  // Check that spa has online booking enabled
  const [settings] = await adminDb
    .select({
      onlineBookingEnabled: spaSettings.onlineBookingEnabled,
      locationId: spaSettings.locationId,
    })
    .from(spaSettings)
    .where(eq(spaSettings.tenantId, tenant.id))
    .limit(1);

  if (!settings || !settings.onlineBookingEnabled) {
    return null;
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    locationId: settings.locationId ?? null,
  };
}

/**
 * Fetches the booking widget config for a tenant.
 * Used by the config route and the book route (for deposit settings).
 */
export async function getBookingWidgetConfig(tenantId: string) {
  // Public route — use admin client to bypass FORCE RLS on spa_booking_widget_config.
  const adminDb = createAdminClient();

  const [config] = await adminDb
    .select({
      theme: spaBookingWidgetConfig.theme,
      logoUrl: spaBookingWidgetConfig.logoUrl,
      welcomeMessage: spaBookingWidgetConfig.welcomeMessage,
      bookingLeadTimeHours: spaBookingWidgetConfig.bookingLeadTimeHours,
      maxAdvanceBookingDays: spaBookingWidgetConfig.maxAdvanceBookingDays,
      requireDeposit: spaBookingWidgetConfig.requireDeposit,
      depositType: spaBookingWidgetConfig.depositType,
      depositValue: spaBookingWidgetConfig.depositValue,
      cancellationWindowHours: spaBookingWidgetConfig.cancellationWindowHours,
      cancellationFeeType: spaBookingWidgetConfig.cancellationFeeType,
      cancellationFeeValue: spaBookingWidgetConfig.cancellationFeeValue,
      showPrices: spaBookingWidgetConfig.showPrices,
      showProviderPhotos: spaBookingWidgetConfig.showProviderPhotos,
      allowProviderSelection: spaBookingWidgetConfig.allowProviderSelection,
      allowAddonSelection: spaBookingWidgetConfig.allowAddonSelection,
      customCss: spaBookingWidgetConfig.customCss,
      redirectUrl: spaBookingWidgetConfig.redirectUrl,
      businessIdentity: spaBookingWidgetConfig.businessIdentity,
      contactLocation: spaBookingWidgetConfig.contactLocation,
      branding: spaBookingWidgetConfig.branding,
      operational: spaBookingWidgetConfig.operational,
      legal: spaBookingWidgetConfig.legal,
      seo: spaBookingWidgetConfig.seo,
    })
    .from(spaBookingWidgetConfig)
    .where(
      and(
        eq(spaBookingWidgetConfig.tenantId, tenantId),
        eq(spaBookingWidgetConfig.isActive, true),
      ),
    )
    .limit(1);

  return config ?? null;
}
