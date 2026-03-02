import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveTenantBySlug, getBookingWidgetConfig } from '../../../resolve-tenant';
import {
  getAppointmentByToken,
  cancelAppointment,
  updateAppointment,
  isWithinCancellationWindow,
  calculateCancellationFee,
  isTerminalStatus,
} from '@oppsera/module-spa';
import type { AppointmentStatus } from '@oppsera/module-spa';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid } from '@oppsera/shared';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';
import { sendSpaCancellationEmail } from '@oppsera/core/email/spa-email-service';

/**
 * GET /api/v1/spa/public/[tenantSlug]/manage/[token]
 *
 * Retrieves appointment details by appointment number (used as the public token).
 * Public — no authentication required.
 *
 * Only exposes guest-safe fields. Internal notes, staff assignments, and audit
 * fields are never returned.
 *
 * Response shape:
 * {
 *   data: {
 *     appointmentNumber: string;
 *     guestName: string | null;
 *     guestEmail: string | null;
 *     guestPhone: string | null;
 *     providerName: string | null;
 *     startAt: string;
 *     endAt: string;
 *     status: string;
 *     notes: string | null;
 *     depositAmountCents: number;
 *     depositStatus: string;
 *     cancellationReason: string | null;
 *     canceledAt: string | null;
 *     canCancel: boolean;
 *     cancellationPolicy: {
 *       windowHours: number;
 *       feeType: string;
 *       feeValue: number;
 *       isWithinWindow: boolean;
 *     } | null;
 *     items: Array<{
 *       id: string;
 *       serviceName: string;
 *       serviceCategory: string;
 *       durationMinutes: number;
 *       providerName: string | null;
 *       startAt: string;
 *       endAt: string;
 *       finalPriceCents: number;
 *       status: string;
 *     }>;
 *   }
 * }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  try {
    const { tenantSlug, token } = await params;

    if (!tenantSlug || tenantSlug.length > 100) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid tenant slug' } },
        { status: 400 },
      );
    }

    if (!token || token.length > 50) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid token' } },
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

    const [appointment, widgetConfig] = await Promise.all([
      getAppointmentByToken({ tenantId: tenant.tenantId, token }),
      getBookingWidgetConfig(tenant.tenantId),
    ]);

    if (!appointment) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Appointment not found' } },
        { status: 404 },
      );
    }

    // Determine if the guest can cancel
    // Guests can only cancel from scheduled or confirmed status (not checked_in or later)
    const guestCancelableStatuses = ['scheduled', 'confirmed'];
    const canCancel = guestCancelableStatuses.includes(appointment.status);

    // Build cancellation policy info
    let cancellationPolicy: {
      windowHours: number;
      feeType: string;
      feeValue: number;
      isWithinWindow: boolean;
    } | null = null;

    if (canCancel && widgetConfig) {
      const windowHours = widgetConfig.cancellationWindowHours ?? 24;
      const withinWindow = isWithinCancellationWindow(
        appointment.startAt,
        new Date(),
        windowHours,
      );

      cancellationPolicy = {
        windowHours,
        feeType: widgetConfig.cancellationFeeType ?? 'none',
        feeValue: widgetConfig.cancellationFeeValue
          ? parseFloat(widgetConfig.cancellationFeeValue)
          : 0,
        isWithinWindow: withinWindow,
      };
    }

    return NextResponse.json({
      data: {
        appointmentNumber: appointment.appointmentNumber,
        guestName: appointment.guestName,
        guestEmail: appointment.guestEmail,
        guestPhone: appointment.guestPhone,
        providerName: appointment.providerName,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        status: appointment.status,
        notes: appointment.notes,
        depositAmountCents: appointment.depositAmountCents,
        depositStatus: appointment.depositStatus,
        cancellationReason: appointment.cancellationReason,
        canceledAt: appointment.canceledAt?.toISOString() ?? null,
        canCancel,
        cancellationPolicy,
        items: appointment.items.map((item) => ({
          id: item.id,
          serviceName: item.serviceName,
          serviceCategory: item.serviceCategory,
          durationMinutes: item.durationMinutes,
          providerName: item.providerName,
          startAt: item.startAt.toISOString(),
          endAt: item.endAt.toISOString(),
          finalPriceCents: item.finalPriceCents,
          status: item.status,
        })),
      },
    });
  } catch (err) {
    console.error('[spa-public] manage GET error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to load appointment' } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/spa/public/[tenantSlug]/manage/[token]
 *
 * Performs an action on the appointment. Currently supports:
 *   - action: 'cancel' — cancels the appointment from scheduled or confirmed status
 *
 * Public — no authentication required. Rate-limited to 5 requests per IP per minute.
 *
 * Request body:
 * {
 *   action: 'cancel';
 *   reason?: string;
 * }
 *
 * Response shape:
 * {
 *   data: {
 *     appointmentNumber: string;
 *     status: 'canceled';
 *     canceledAt: string;
 *     cancellationReason: string | null;
 *     cancellationFee: {
 *       feeCents: number;
 *       isWithinWindow: boolean;
 *       depositRefundCents: number;
 *     } | null;
 *   }
 * }
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string; token: string }> },
) {
  try {
    const { tenantSlug, token } = await params;

    if (!tenantSlug || tenantSlug.length > 100) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid tenant slug' } },
        { status: 400 },
      );
    }

    if (!token || token.length > 50) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid token' } },
        { status: 400 },
      );
    }

    // Rate limit check
    const rlKey = getRateLimitKey(request, 'spa:manage');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again in a minute.' } },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Spa not found or online booking not enabled' } },
        { status: 404 },
      );
    }

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const { action, reason } = body as {
      action?: string;
      reason?: string;
    };

    if (!action || typeof action !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action is required' } },
        { status: 400 },
      );
    }

    if (action !== 'cancel' && action !== 'update_notes') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: `Unsupported action: ${action}. Supported: cancel, update_notes` } },
        { status: 400 },
      );
    }

    // ── Update Notes Action ─────────────────────────────────────
    if (action === 'update_notes') {
      const { notes } = body as { notes?: string };

      if (notes === undefined || typeof notes !== 'string') {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'notes is required (string)' } },
          { status: 400 },
        );
      }

      const trimmedNotes = notes.trim();
      if (trimmedNotes.length > 500) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'notes must be 500 characters or fewer' } },
          { status: 400 },
        );
      }

      // Fetch the appointment by token
      const appointment = await getAppointmentByToken({
        tenantId: tenant.tenantId,
        token,
      });

      if (!appointment) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Appointment not found' } },
          { status: 404 },
        );
      }

      // Only allow notes update on scheduled or confirmed appointments
      if (isTerminalStatus(appointment.status as AppointmentStatus)) {
        return NextResponse.json(
          { error: { code: 'ALREADY_TERMINAL', message: `Appointment is already ${appointment.status}` } },
          { status: 409 },
        );
      }

      // Build synthetic RequestContext
      const clientRequestId = `online-notes-${generateUlid()}`;
      const ctx: RequestContext = {
        user: {
          id: 'system:online-booking',
          email: 'booking@system.oppsera.com',
          name: 'Online Booking System',
          tenantId: tenant.tenantId,
          tenantStatus: 'active',
          membershipStatus: 'none',
        },
        tenantId: tenant.tenantId,
        locationId: tenant.locationId ?? undefined,
        requestId: clientRequestId,
        isPlatformAdmin: false,
      };

      await updateAppointment(ctx, {
        id: appointment.id,
        expectedVersion: appointment.version,
        notes: trimmedNotes,
      });

      return NextResponse.json({
        data: {
          appointmentNumber: appointment.appointmentNumber,
          notes: trimmedNotes,
        },
      });
    }

    // ── Cancel Action ───────────────────────────────────────────

    // Fetch the appointment by token (appointmentNumber)
    const appointment = await getAppointmentByToken({
      tenantId: tenant.tenantId,
      token,
    });

    if (!appointment) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Appointment not found' } },
        { status: 404 },
      );
    }

    // Guests can only cancel from scheduled or confirmed status
    const guestCancelableStatuses = ['scheduled', 'confirmed'];
    if (!guestCancelableStatuses.includes(appointment.status)) {
      // If it's already in a terminal state, return a clear message
      if (isTerminalStatus(appointment.status as AppointmentStatus)) {
        return NextResponse.json(
          { error: { code: 'ALREADY_TERMINAL', message: `Appointment is already ${appointment.status}` } },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: { code: 'CANCELLATION_NOT_ALLOWED', message: 'This appointment cannot be canceled online. Please contact the spa directly.' } },
        { status: 422 },
      );
    }

    // Compute cancellation fee (informational — actual fee handling is done by the command)
    let cancellationFeeInfo: {
      feeCents: number;
      isWithinWindow: boolean;
      depositRefundCents: number;
    } | null = null;

    const widgetConfig = await getBookingWidgetConfig(tenant.tenantId);

    if (widgetConfig) {
      const windowHours = widgetConfig.cancellationWindowHours ?? 24;
      const now = new Date();
      const withinWindow = isWithinCancellationWindow(
        appointment.startAt,
        now,
        windowHours,
      );

      if (withinWindow && widgetConfig.cancellationFeeType && widgetConfig.cancellationFeeType !== 'none') {
        // Calculate the total service price from items
        const serviceTotalCents = appointment.items.reduce(
          (sum, item) => sum + item.finalPriceCents,
          0,
        );

        const feeResult = calculateCancellationFee({
          appointmentStartAt: appointment.startAt,
          canceledAt: now,
          serviceTotalCents,
          depositAmountCents: appointment.depositAmountCents,
          isMember: false,
          isFirstCancellation: true, // Conservative — no lookup for guest bookings
          bookingSource: 'online',
          config: {
            cancellationWindowHours: windowHours,
            cancellationFeeType: widgetConfig.cancellationFeeType as 'percentage' | 'flat' | 'none',
            cancellationFeeValue: widgetConfig.cancellationFeeValue
              ? parseFloat(widgetConfig.cancellationFeeValue)
              : 0,
          },
        });

        cancellationFeeInfo = {
          feeCents: feeResult.feeCents,
          isWithinWindow: feeResult.isWithinWindow,
          depositRefundCents: feeResult.depositRefundCents,
        };
      } else {
        cancellationFeeInfo = {
          feeCents: 0,
          isWithinWindow: withinWindow,
          depositRefundCents: appointment.depositAmountCents,
        };
      }
    }

    // Build synthetic RequestContext for the cancel command (same pattern as the book route)
    const clientRequestId = `online-cancel-${generateUlid()}`;
    const ctx: RequestContext = {
      user: {
        id: 'system:online-booking',
        email: 'booking@system.oppsera.com',
        name: 'Online Booking System',
        tenantId: tenant.tenantId,
        tenantStatus: 'active',
        membershipStatus: 'none',
      },
      tenantId: tenant.tenantId,
      locationId: tenant.locationId ?? undefined,
      requestId: clientRequestId,
      isPlatformAdmin: false,
    };

    // Execute the cancel command
    const _result = await cancelAppointment(ctx, {
      id: appointment.id,
      expectedVersion: appointment.version,
      reason: typeof reason === 'string' ? reason.trim() : 'Canceled online by guest',
      chargeCancellationFee: cancellationFeeInfo ? cancellationFeeInfo.feeCents > 0 : false,
      waiveFee: false,
    });

    // ── Send cancellation email (non-fatal) ──────────────────────
    if (appointment.guestEmail) {
      try {
        const baseUrl = new URL(request.url).origin;
        const bookAgainUrl = `${baseUrl}/book/${tenantSlug}/spa`;
        const serviceName = appointment.items[0]?.serviceName ?? 'Appointment';

        await sendSpaCancellationEmail(appointment.guestEmail, {
          spaName: tenant.tenantName,
          logoUrl: widgetConfig?.logoUrl ?? null,
          guestName: appointment.guestName ?? 'Guest',
          appointmentNumber: appointment.appointmentNumber,
          serviceName,
          providerName: appointment.providerName ?? null,
          startAt: appointment.startAt,
          cancellationFeeCents: cancellationFeeInfo?.feeCents ?? null,
          depositRefundCents: cancellationFeeInfo?.depositRefundCents ?? null,
          bookAgainUrl,
        });
      } catch (emailErr) {
        console.error('[spa-email] Failed to send cancellation email:', emailErr);
      }
    }

    return NextResponse.json({
      data: {
        appointmentNumber: appointment.appointmentNumber,
        status: 'canceled',
        canceledAt: new Date().toISOString(),
        cancellationReason: typeof reason === 'string' ? reason.trim() : 'Canceled online by guest',
        cancellationFee: cancellationFeeInfo,
      },
    });
  } catch (err: unknown) {
    // Handle specific error types
    if (err && typeof err === 'object' && 'code' in err) {
      const appErr = err as { code: string; message: string; statusCode?: number };

      if (appErr.code === 'INVALID_STATUS_TRANSITION') {
        return NextResponse.json(
          { error: { code: 'CANCELLATION_NOT_ALLOWED', message: 'This appointment cannot be canceled at this time.' } },
          { status: 422 },
        );
      }

      if (appErr.code === 'VERSION_CONFLICT') {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: 'Appointment was modified. Please refresh and try again.' } },
          { status: 409 },
        );
      }

      if (appErr.code === 'NOT_FOUND') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Appointment not found' } },
          { status: 404 },
        );
      }
    }

    console.error('[spa-public] manage POST error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to process request. Please try again.' } },
      { status: 500 },
    );
  }
}
