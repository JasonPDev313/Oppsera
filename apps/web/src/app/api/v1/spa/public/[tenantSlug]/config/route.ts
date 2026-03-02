import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug, getBookingWidgetConfig } from '../../resolve-tenant';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';

/**
 * GET /api/v1/spa/public/[tenantSlug]/config
 *
 * Returns the booking widget configuration for a tenant.
 * Public — no authentication required.
 *
 * Response shape:
 * {
 *   data: {
 *     tenantName: string;
 *     theme: Record<string, unknown> | null;
 *     logoUrl: string | null;
 *     welcomeMessage: string | null;
 *     bookingLeadTimeHours: number;
 *     maxAdvanceBookingDays: number;
 *     requireDeposit: boolean;
 *     depositType: 'percentage' | 'flat';
 *     depositValue: string;
 *     cancellationWindowHours: number;
 *     cancellationFeeType: 'percentage' | 'flat' | 'none';
 *     cancellationFeeValue: string;
 *     showPrices: boolean;
 *     showProviderPhotos: boolean;
 *     allowProviderSelection: boolean;
 *     allowAddonSelection: boolean;
 *     customCss: string | null;
 *     redirectUrl: string | null;
 *     businessIdentity: Record<string, unknown>;
 *     contactLocation: Record<string, unknown>;
 *     branding: Record<string, unknown>;
 *     operational: Record<string, unknown>;
 *     legal: Record<string, unknown>;
 *     seo: Record<string, unknown>;
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  try {
    // Rate limit check
    const rlKey = getRateLimitKey(request, 'spa:config');
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

    const config = await getBookingWidgetConfig(tenant.tenantId);

    // Use business identity name override if set, fallback to tenant name
    const businessIdentity = (config?.businessIdentity ?? {}) as Record<string, unknown>;
    const displayName = (typeof businessIdentity.businessName === 'string' && businessIdentity.businessName)
      ? businessIdentity.businessName
      : tenant.tenantName;

    // Return defaults if no config row exists
    return NextResponse.json({
      data: {
        tenantName: displayName,
        theme: config?.theme ?? null,
        logoUrl: config?.logoUrl ?? null,
        welcomeMessage: config?.welcomeMessage ?? null,
        bookingLeadTimeHours: config?.bookingLeadTimeHours ?? 2,
        maxAdvanceBookingDays: config?.maxAdvanceBookingDays ?? 90,
        requireDeposit: config?.requireDeposit ?? false,
        depositType: config?.depositType ?? 'percentage',
        depositValue: config?.depositValue ?? '0',
        cancellationWindowHours: config?.cancellationWindowHours ?? 24,
        cancellationFeeType: config?.cancellationFeeType ?? 'none',
        cancellationFeeValue: config?.cancellationFeeValue ?? '0',
        showPrices: config?.showPrices ?? true,
        showProviderPhotos: config?.showProviderPhotos ?? true,
        allowProviderSelection: config?.allowProviderSelection ?? true,
        allowAddonSelection: config?.allowAddonSelection ?? true,
        customCss: config?.customCss ?? null,
        redirectUrl: config?.redirectUrl ?? null,
        businessIdentity: businessIdentity,
        contactLocation: (config?.contactLocation ?? {}) as Record<string, unknown>,
        branding: (config?.branding ?? {}) as Record<string, unknown>,
        operational: (config?.operational ?? {}) as Record<string, unknown>,
        legal: (config?.legal ?? {}) as Record<string, unknown>,
        seo: (config?.seo ?? {}) as Record<string, unknown>,
      },
    });
  } catch (err) {
    console.error('[spa-public] config error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load booking configuration' } },
      { status: 500 },
    );
  }
}
