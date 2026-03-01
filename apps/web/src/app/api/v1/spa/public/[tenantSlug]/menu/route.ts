import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug, getBookingWidgetConfig } from '../../resolve-tenant';
import { getServiceMenu } from '@oppsera/module-spa';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';

/**
 * GET /api/v1/spa/public/[tenantSlug]/menu
 *
 * Returns the full service menu organized by category.
 * Public — no authentication required.
 *
 * Only includes active services and active categories.
 * Prices are included or excluded based on widget config `showPrices`.
 *
 * Response shape:
 * {
 *   data: {
 *     categories: Array<{
 *       id: string;
 *       name: string;
 *       description: string | null;
 *       icon: string | null;
 *       sortOrder: number;
 *       services: Array<{
 *         id: string;
 *         name: string;
 *         displayName: string | null;
 *         description: string | null;
 *         durationMinutes: number;
 *         priceCents: number | null;
 *         memberPriceCents: number | null;
 *         maxCapacity: number;
 *         isCouples: boolean;
 *         isGroup: boolean;
 *         requiresIntake: boolean;
 *         requiresConsent: boolean;
 *         imageUrl: string | null;
 *         sortOrder: number;
 *       }>
 *     }>
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  try {
    // Rate limit check
    const rlKey = getRateLimitKey(request, 'spa:menu');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.publicRead);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const { tenantSlug } = await params;

    if (!tenantSlug || tenantSlug.length > 100) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid tenant slug' } },
        { status: 400 },
      );
    }

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Spa not found or online booking not enabled' } },
        { status: 404 },
      );
    }

    // Fetch menu and widget config in parallel
    const [menu, widgetConfig] = await Promise.all([
      getServiceMenu(tenant.tenantId, tenant.locationId ?? undefined),
      getBookingWidgetConfig(tenant.tenantId),
    ]);

    const showPrices = widgetConfig?.showPrices ?? true;

    // Map to public shape — convert dollar strings to cents, strip internal fields
    const categories = menu.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
      services: cat.services.map((svc) => ({
        id: svc.id,
        name: svc.displayName ?? svc.name,
        displayName: svc.displayName,
        description: svc.description,
        durationMinutes: svc.durationMinutes,
        priceCents: showPrices ? dollarsToCents(svc.price) : null,
        memberPriceCents: showPrices && svc.memberPrice ? dollarsToCents(svc.memberPrice) : null,
        maxCapacity: svc.maxCapacity,
        isCouples: svc.isCouples,
        isGroup: svc.isGroup,
        requiresIntake: svc.requiresIntake,
        requiresConsent: svc.requiresConsent,
        imageUrl: svc.imageUrl,
        sortOrder: svc.sortOrder,
      })),
    }));

    return NextResponse.json({ data: { categories } });
  } catch (err) {
    console.error('[spa-public] menu error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load service menu' } },
      { status: 500 },
    );
  }
}

/**
 * Convert a dollar string (e.g. "150.00") to integer cents (15000).
 */
function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}
