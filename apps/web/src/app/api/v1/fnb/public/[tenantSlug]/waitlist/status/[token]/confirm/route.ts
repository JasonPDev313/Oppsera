import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getRateLimitKey, RATE_LIMITS, rateLimitHeaders } from '@oppsera/core/security';
import { AppError } from '@oppsera/shared';
import { confirmWaitlistArrival } from '@oppsera/module-fnb';
import { resolveWaitlistTenant } from '../../../../resolve-waitlist-tenant';

const confirmSchema = z.object({
  estimatedMinutes: z.number().int().min(1).max(60).optional(),
});

/**
 * POST /api/v1/fnb/public/[tenantSlug]/waitlist/status/[token]/confirm
 *
 * Guest self-service "I'm on my way" confirmation after being notified.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  const { tenantSlug, token } = await params;

  const rlKey = getRateLimitKey(req, 'wl-confirm');
  const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
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
        { error: { code: 'NOT_FOUND', message: 'Waitlist not found' } },
        { status: 404 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = confirmSchema.safeParse(body);
    const estimatedMinutes = parsed.success ? parsed.data.estimatedMinutes : undefined;

    const result = await confirmWaitlistArrival(resolved.tenantId, token, estimatedMinutes);

    return NextResponse.json({
      data: {
        confirmationStatus: result.confirmationStatus,
        estimatedArrivalAt: result.estimatedArrivalAt,
      },
    }, { headers: rateLimitHeaders(rl) });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.statusCode },
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to confirm arrival' } },
      { status: 500 },
    );
  }
}
