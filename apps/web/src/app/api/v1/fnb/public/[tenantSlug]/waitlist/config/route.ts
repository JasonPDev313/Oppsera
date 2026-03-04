import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, rateLimitHeaders } from '@oppsera/core/security';
import { resolveWaitlistTenant } from '../../resolve-waitlist-tenant';

/**
 * GET /api/v1/fnb/public/[tenantSlug]/waitlist/config
 *
 * Returns public-safe waitlist configuration: branding, form fields, content.
 * Strips internal fields (queue config details, notification templates).
 * Rate-limited, no auth required.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  // Rate limit
  const rlKey = getRateLimitKey(req, 'wl-config');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicRead);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  try {
    const resolved = await resolveWaitlistTenant(tenantSlug);
    if (!resolved) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Waitlist not found or not enabled' } },
        { status: 404 },
      );
    }

    const { config, tenantName, locationName } = resolved;

    // Return only public-safe config (no notification templates, no queue internals)
    return NextResponse.json({
      data: {
        venueName: locationName || tenantName,
        branding: config.branding,
        form: {
          minPartySize: config.formConfig.minPartySize,
          maxPartySize: config.formConfig.maxPartySize,
          requirePhone: config.formConfig.requirePhone,
          enableSeatingPreference: config.formConfig.enableSeatingPreference,
          seatingOptions: config.formConfig.seatingOptions,
          enableOccasion: config.formConfig.enableOccasion,
          occasionOptions: config.formConfig.occasionOptions,
          enableNotes: config.formConfig.enableNotes,
          notesMaxLength: config.formConfig.notesMaxLength,
          customFields: config.formConfig.customFields,
          termsText: config.formConfig.termsText,
        },
        content: config.contentConfig,
        operatingHours: config.operatingHours,
        allowCheckWait: config.queueConfig.allowCheckWaitBeforeJoining,
      },
    }, { headers: rateLimitHeaders(rl) });
  } catch {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load waitlist config' } },
      { status: 500 },
    );
  }
}
