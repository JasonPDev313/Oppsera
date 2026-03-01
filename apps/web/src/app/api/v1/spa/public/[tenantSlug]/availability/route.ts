import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug } from '../../resolve-tenant';
import { getAvailableSlots } from '@oppsera/module-spa';
import type { GetAvailableSlotsParams } from '@oppsera/module-spa';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';

/**
 * GET /api/v1/spa/public/[tenantSlug]/availability?serviceId=xxx&date=YYYY-MM-DD&providerId=yyy
 *
 * Returns available time slots for a given service and date.
 * Optionally filtered by providerId.
 * Public — no authentication required.
 *
 * Query params:
 *   serviceId (required) — the service to check availability for
 *   date (required) — ISO date string YYYY-MM-DD
 *   providerId (optional) — filter to a specific provider
 *
 * Slots are grouped by time period: morning (<12:00), afternoon (12:00-17:00), evening (>=17:00).
 *
 * Response shape:
 * {
 *   data: {
 *     date: string;
 *     slots: Array<{
 *       providerId: string;
 *       providerName: string;
 *       startTime: string;     // ISO datetime
 *       endTime: string;       // ISO datetime
 *       resourceId: string | null;
 *       resourceName: string | null;
 *     }>;
 *     grouped: {
 *       morning: Array<...>;
 *       afternoon: Array<...>;
 *       evening: Array<...>;
 *     }
 *   }
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  try {
    // Rate limit check
    const rlKey = getRateLimitKey(request, 'spa:availability');
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
    const serviceId = url.searchParams.get('serviceId');
    const date = url.searchParams.get('date');
    const providerId = url.searchParams.get('providerId') ?? undefined;

    // Validate required params
    if (!serviceId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'serviceId is required' } },
        { status: 400 },
      );
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'date is required in YYYY-MM-DD format' } },
        { status: 400 },
      );
    }

    // Validate date is not in the past
    const requestedDate = new Date(date + 'T00:00:00Z');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (requestedDate < today) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Cannot check availability for past dates' } },
        { status: 400 },
      );
    }

    // Validate date is not too far in the future (max 90 days)
    const maxDate = new Date(today);
    maxDate.setUTCDate(maxDate.getUTCDate() + 90);
    if (requestedDate > maxDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Cannot check availability more than 90 days ahead' } },
        { status: 400 },
      );
    }

    // Use the availability engine helper (from helpers/availability-engine)
    const slotsParams: GetAvailableSlotsParams = {
      tenantId: tenant.tenantId,
      serviceId,
      startDate: date,
      endDate: date,
      providerId,
      locationId: tenant.locationId ?? undefined,
    };

    const rawSlots = await getAvailableSlots(slotsParams);

    // Map to public shape with ISO strings
    const slots = rawSlots.map((s) => ({
      providerId: s.providerId,
      providerName: s.providerName,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      resourceId: s.resourceId ?? null,
      resourceName: s.resourceName ?? null,
    }));

    // Group by time period
    const morning: typeof slots = [];
    const afternoon: typeof slots = [];
    const evening: typeof slots = [];

    for (const slot of slots) {
      const hour = new Date(slot.startTime).getUTCHours();
      if (hour < 12) {
        morning.push(slot);
      } else if (hour < 17) {
        afternoon.push(slot);
      } else {
        evening.push(slot);
      }
    }

    return NextResponse.json({
      data: {
        date,
        slots,
        grouped: { morning, afternoon, evening },
      },
    });
  } catch (err) {
    console.error('[spa-public] availability error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to check availability' } },
      { status: 500 },
    );
  }
}
