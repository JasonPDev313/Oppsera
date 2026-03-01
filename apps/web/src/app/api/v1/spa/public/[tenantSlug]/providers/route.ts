import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug, getBookingWidgetConfig } from '../../resolve-tenant';
import { listProviders } from '@oppsera/module-spa';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';

/**
 * GET /api/v1/spa/public/[tenantSlug]/providers?serviceId=xxx
 *
 * Returns providers available for online booking.
 * Optionally filtered by serviceId (only shows eligible providers).
 * Public — no authentication required.
 *
 * Only includes providers where isActive=true AND isBookableOnline=true.
 * Provider photos are included or excluded based on widget config `showProviderPhotos`.
 *
 * Response shape:
 * {
 *   data: {
 *     providers: Array<{
 *       id: string;
 *       displayName: string;
 *       bio: string | null;
 *       photoUrl: string | null;
 *       specialties: string[] | null;
 *       color: string | null;
 *       sortOrder: number;
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
    const rlKey = getRateLimitKey(request, 'spa:providers');
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

    const url = new URL(request.url);
    const serviceId = url.searchParams.get('serviceId') ?? undefined;

    // Fetch providers and widget config in parallel
    const [result, widgetConfig] = await Promise.all([
      listProviders({
        tenantId: tenant.tenantId,
        serviceId,
        isActive: true,
        limit: 100,
      }),
      getBookingWidgetConfig(tenant.tenantId),
    ]);

    const showPhotos = widgetConfig?.showProviderPhotos ?? true;

    // Filter to online-bookable providers and map to public shape
    const providers = result.items
      .filter((p) => p.isBookableOnline)
      .map((p) => ({
        id: p.id,
        displayName: p.displayName,
        bio: p.bio,
        photoUrl: showPhotos ? p.photoUrl : null,
        specialties: p.specialties,
        color: p.color,
        sortOrder: p.sortOrder,
      }));

    return NextResponse.json({ data: { providers } });
  } catch (err) {
    console.error('[spa-public] providers error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load providers' } },
      { status: 500 },
    );
  }
}
