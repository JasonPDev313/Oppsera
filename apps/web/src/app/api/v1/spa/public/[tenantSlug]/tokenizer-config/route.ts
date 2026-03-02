import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug } from '../../resolve-tenant';
import { getTokenizerConfig } from '@oppsera/module-payments';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';

/**
 * GET /api/v1/spa/public/[tenantSlug]/tokenizer-config
 *
 * Returns the payment tokenizer configuration for card input on the guest booking page.
 * Public — no authentication required. Rate-limited to 30 requests per IP per minute.
 *
 * Response shape (200):
 * {
 *   data: {
 *     providerCode: string;
 *     isSandbox: boolean;
 *     iframe: { site: string; iframeUrl: string };
 *   } | null
 * }
 *
 * Returns `data: null` when no payment gateway is configured (deposits tracked but not collected online).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  try {
    const rlKey = getRateLimitKey(request, 'spa:tokenizer-config');
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

    // Resolve tokenizer config — returns null if no gateway configured
    const config = await getTokenizerConfig(tenant.tenantId, tenant.locationId ?? undefined);

    // Return only the fields the guest booking page needs (no sensitive data)
    return NextResponse.json({
      data: config
        ? {
            providerCode: config.providerCode,
            isSandbox: config.isSandbox,
            iframe: config.iframe,
          }
        : null,
    });
  } catch (err) {
    console.error('[spa-public] tokenizer-config error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load payment configuration' } },
      { status: 500 },
    );
  }
}
