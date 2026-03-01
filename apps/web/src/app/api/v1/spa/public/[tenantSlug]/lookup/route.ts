import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug } from '../../resolve-tenant';
import { getAppointmentByToken } from '@oppsera/module-spa';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';

/**
 * POST /api/v1/spa/public/[tenantSlug]/lookup
 *
 * Looks up an appointment for guest self-service management.
 * Accepts appointment number + guest email for verification.
 * Public — no authentication required.
 *
 * Request body:
 * {
 *   appointmentNumber: string;   // e.g. "SPA-20260228-A1B2C3"
 *   email: string;               // guest email for verification
 * }
 *
 * Response shape (200):
 * {
 *   data: {
 *     appointmentId: string;
 *     appointmentNumber: string;
 *     status: string;
 *     guestName: string | null;
 *     providerName: string | null;
 *     startAt: string;           // ISO datetime
 *     endAt: string;             // ISO datetime
 *     notes: string | null;
 *     deposit: {
 *       amountCents: number;
 *       status: string;
 *     } | null;
 *     cancellation: {
 *       reason: string | null;
 *       canceledAt: string | null;
 *     } | null;
 *     items: Array<{
 *       serviceName: string;
 *       durationMinutes: number;
 *       providerName: string | null;
 *       startAt: string;
 *       endAt: string;
 *       priceCents: number;
 *       status: string;
 *     }>;
 *     createdAt: string;
 *   }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  try {
    // Rate limit check
    const rlKey = getRateLimitKey(request, 'spa:lookup');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again in a minute.' } },
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

    // Parse and validate body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    // Honeypot check — hidden field that bots auto-fill
    if (body.website || body.url || body.company_url) {
      // Return fake success to avoid tipping off the bot
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Appointment not found. Please check your appointment number and email.' } },
        { status: 404 },
      );
    }

    const { appointmentNumber, email } = body as {
      appointmentNumber?: string;
      email?: string;
    };

    // Validate required fields
    if (!appointmentNumber || typeof appointmentNumber !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'appointmentNumber is required' } },
        { status: 400 },
      );
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Valid email is required for verification' } },
        { status: 400 },
      );
    }

    // Look up the appointment by its number (used as public token)
    const appointment = await getAppointmentByToken({
      tenantId: tenant.tenantId,
      token: appointmentNumber.trim(),
    });

    if (!appointment) {
      // Don't reveal whether the appointment exists — use generic message
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Appointment not found. Please check your appointment number and email.' } },
        { status: 404 },
      );
    }

    // Verify the email matches (case-insensitive) for security
    const normalizedEmail = email.trim().toLowerCase();
    const appointmentEmail = (appointment.guestEmail ?? '').trim().toLowerCase();

    if (normalizedEmail !== appointmentEmail) {
      // Same generic message — don't leak that the appointment exists
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Appointment not found. Please check your appointment number and email.' } },
        { status: 404 },
      );
    }

    // Build deposit info
    let deposit: { amountCents: number; status: string } | null = null;
    if (appointment.depositAmountCents > 0) {
      deposit = {
        amountCents: appointment.depositAmountCents,
        status: appointment.depositStatus,
      };
    }

    // Build cancellation info
    let cancellation: { reason: string | null; canceledAt: string | null } | null = null;
    if (appointment.canceledAt) {
      cancellation = {
        reason: appointment.cancellationReason,
        canceledAt: appointment.canceledAt.toISOString(),
      };
    }

    // Map items to public shape
    const items = appointment.items.map((item) => ({
      serviceName: item.serviceName,
      durationMinutes: item.durationMinutes,
      providerName: item.providerName,
      startAt: item.startAt.toISOString(),
      endAt: item.endAt.toISOString(),
      priceCents: item.finalPriceCents,
      status: item.status,
    }));

    return NextResponse.json({
      data: {
        appointmentId: appointment.id,
        appointmentNumber: appointment.appointmentNumber,
        status: appointment.status,
        guestName: appointment.guestName,
        providerName: appointment.providerName,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        notes: appointment.notes,
        deposit,
        cancellation,
        items,
        createdAt: appointment.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[spa-public] lookup error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to look up appointment' } },
      { status: 500 },
    );
  }
}
