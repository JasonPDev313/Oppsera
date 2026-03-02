import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { resolveTenantBySlug, getBookingWidgetConfig } from '../../resolve-tenant';
import {
  createAppointment,
  getServiceForBooking,
  calculateDeposit,
} from '@oppsera/module-spa';
import { paymentsFacade } from '@oppsera/module-payments';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, buildGoogleCalendarUrl, buildOutlookCalendarUrl } from '@oppsera/shared';
import { checkRateLimit, getRateLimitKey, rateLimitHeaders, RATE_LIMITS } from '@oppsera/core/security';
import { sendSpaConfirmationEmail } from '@oppsera/core/email/spa-email-service';
import { withTenant } from '@oppsera/db';
import { spaAppointments } from '@oppsera/db/schema';
import { eq } from 'drizzle-orm';

// ── Management Token ──────────────────────────────────────────────
// 8-char base64url token for guest appointment management (same pattern as guest waitlist)

function generateManagementToken(): string {
  return randomBytes(6).toString('base64url').slice(0, 8);
}

/** Helper to update appointment fields safely within RLS context */
async function updateAppointment(
  tenantId: string,
  appointmentId: string,
  fields: Partial<typeof spaAppointments.$inferInsert>,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await tx.update(spaAppointments)
      .set(fields)
      .where(eq(spaAppointments.id, appointmentId));
  });
}

/**
 * POST /api/v1/spa/public/[tenantSlug]/book
 *
 * Creates a new spa appointment booking.
 * Public — no authentication required. Rate-limited to 3 bookings per IP per minute.
 *
 * Request body:
 * {
 *   serviceId: string;
 *   providerId?: string;
 *   date: string;             // YYYY-MM-DD
 *   startTime: string;        // ISO datetime
 *   guestName: string;
 *   guestEmail: string;
 *   guestPhone?: string;
 *   notes?: string;
 *   paymentMethodToken?: string;  // CardPointe tokenized card
 *   expiry?: string;              // MMYY format
 *   cvv?: string;                 // 3-4 digits
 * }
 *
 * Response shape (201):
 * {
 *   data: {
 *     appointmentId: string;
 *     appointmentNumber: string;
 *     managementToken: string;
 *     status: string;
 *     startAt: string;
 *     endAt: string;
 *     deposit: {
 *       required: boolean;
 *       amountCents: number;
 *       depositType: string;
 *       status: 'authorized' | 'required' | 'none';
 *     } | null;
 *   }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  try {
    const { tenantSlug } = await params;

    if (!tenantSlug || tenantSlug.length > 100) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid tenant slug' } },
        { status: 400 },
      );
    }

    // Rate limit check
    const rlKey = getRateLimitKey(request, 'spa:book');
    const rl = checkRateLimit(rlKey, RATE_LIMITS.publicWrite);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many booking requests. Please try again in a minute.' } },
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
      // Return 200 to avoid tipping off the bot
      return NextResponse.json({ data: { appointmentId: 'ok', appointmentNumber: 'ok', status: 'scheduled' } }, { status: 201 });
    }

    const {
      serviceId,
      providerId,
      startTime,
      guestName,
      guestEmail,
      guestPhone,
      notes,
      paymentMethodToken,
      expiry,
      cvv,
    } = body as {
      serviceId?: string;
      providerId?: string;
      startTime?: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      notes?: string;
      paymentMethodToken?: string;
      expiry?: string;
      cvv?: string;
    };

    // Validate required fields
    if (!serviceId || typeof serviceId !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'serviceId is required' } },
        { status: 400 },
      );
    }

    if (!startTime || typeof startTime !== 'string') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startTime is required (ISO datetime)' } },
        { status: 400 },
      );
    }

    if (!guestName || typeof guestName !== 'string' || guestName.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'guestName is required' } },
        { status: 400 },
      );
    }

    if (!guestEmail || typeof guestEmail !== 'string' || !guestEmail.includes('@')) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Valid guestEmail is required' } },
        { status: 400 },
      );
    }

    // Validate startTime is a valid date
    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'startTime must be a valid ISO datetime' } },
        { status: 400 },
      );
    }

    // Don't allow booking in the past
    if (startDate <= new Date()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Cannot book appointments in the past' } },
        { status: 400 },
      );
    }

    // Fetch the service to get duration and price
    const service = await getServiceForBooking(tenant.tenantId, serviceId);
    if (!service) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Service not found or not available for booking' } },
        { status: 404 },
      );
    }

    // Validate provider is eligible for this service (if specified)
    if (providerId) {
      const eligible = service.eligibleProviders.some(
        (p) => p.providerId === providerId && p.isBookableOnline,
      );
      if (!eligible) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Selected provider is not available for this service' } },
          { status: 400 },
        );
      }
    }

    // Calculate end time based on service total block time
    const endDate = new Date(startDate.getTime() + service.totalBlockMinutes * 60_000);

    // Convert dollar price to cents
    const priceCents = Math.round(parseFloat(service.price) * 100);

    // Generate management token and client request ID
    const managementToken = generateManagementToken();
    const clientRequestId = `online-booking-${generateUlid()}`;

    // Build synthetic RequestContext for the command
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

    // Create the appointment
    const result = await createAppointment(ctx, {
      clientRequestId,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim().toLowerCase(),
      guestPhone: typeof guestPhone === 'string' ? guestPhone.trim() : undefined,
      locationId: tenant.locationId ?? '',
      providerId: typeof providerId === 'string' ? providerId : undefined,
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      bookingSource: 'online',
      bookingChannel: 'booking_widget',
      notes: typeof notes === 'string' ? notes.trim() : undefined,
      items: [
        {
          serviceId,
          providerId: typeof providerId === 'string' ? providerId : undefined,
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
          priceCents,
          finalPriceCents: priceCents,
        },
      ],
    });

    // Calculate deposit if applicable
    let depositInfo: {
      required: boolean;
      amountCents: number;
      depositType: string;
      status: 'authorized' | 'required' | 'none';
    } | null = null;

    const widgetConfig = await getBookingWidgetConfig(tenant.tenantId);
    if (widgetConfig?.requireDeposit) {
      const depositResult = calculateDeposit({
        serviceTotalCents: priceCents,
        bookingSource: 'online',
        isMember: false,
        config: {
          requireDeposit: widgetConfig.requireDeposit,
          depositType: widgetConfig.depositType as 'percentage' | 'flat',
          depositValue: parseFloat(widgetConfig.depositValue),
        },
      });

      if (depositResult.required && depositResult.amountCents > 0) {
        depositInfo = {
          required: true,
          amountCents: depositResult.amountCents,
          depositType: depositResult.depositType,
          status: 'required',
        };

        // ── Attempt deposit authorization if card token provided ──
        if (paymentMethodToken && typeof paymentMethodToken === 'string') {
          try {
            const paymentResult = await paymentsFacade.authorize(ctx, {
              clientRequestId: `spa-deposit-${result.id}`,
              amountCents: depositResult.amountCents,
              token: paymentMethodToken,
              expiry: typeof expiry === 'string' ? expiry : undefined,
              cvv: typeof cvv === 'string' ? cvv : undefined,
              locationId: tenant.locationId ?? undefined,
              ecomind: 'E',
              metadata: {
                appointmentId: result.id,
                appointmentNumber: result.appointmentNumber,
                source: 'online-booking',
              },
            });

            if (paymentResult.status === 'authorized') {
              depositInfo.status = 'authorized';
              try {
                await updateAppointment(tenant.tenantId, result.id, {
                  depositAmountCents: depositResult.amountCents,
                  depositStatus: 'authorized',
                  depositPaymentId: paymentResult.id ?? null,
                });
              } catch (dbErr) {
                console.error('[spa-deposit] Failed to update deposit status after authorization:', dbErr);
              }
            } else {
              // Card declined — booking still succeeds, staff will collect deposit manually
              console.warn('[spa-deposit] Authorization declined for appointment', result.appointmentNumber, paymentResult.errorMessage);
              try {
                await updateAppointment(tenant.tenantId, result.id, {
                  depositAmountCents: depositResult.amountCents,
                  depositStatus: 'required',
                });
              } catch (dbErr) {
                console.error('[spa-deposit] Failed to update deposit status after decline:', dbErr);
              }
            }
          } catch (payErr) {
            // Gateway error — booking still succeeds, staff will collect deposit manually
            console.error('[spa-deposit] Authorization error for appointment', result.appointmentNumber, payErr);
            try {
              await updateAppointment(tenant.tenantId, result.id, {
                depositAmountCents: depositResult.amountCents,
                depositStatus: 'required',
              });
            } catch (dbErr) {
              console.error('[spa-deposit] Failed to update deposit status after error:', dbErr);
            }
          }
        } else {
          // No card token — deposit tracked but not collected online
          try {
            await updateAppointment(tenant.tenantId, result.id, {
              depositAmountCents: depositResult.amountCents,
              depositStatus: 'required',
            });
          } catch (dbErr) {
            console.error('[spa-deposit] Failed to update deposit amount:', dbErr);
          }
        }
      }
    }

    // ── Send confirmation email (non-fatal) ─────────────────────
    try {
      const baseUrl = new URL(request.url).origin;
      const manageUrl = `${baseUrl}/book/${tenantSlug}/spa/manage/${result.appointmentNumber}`;
      const serviceName = service.displayName ?? service.name;

      const calendarEvent = {
        title: `${serviceName} at ${tenant.tenantName}`,
        startAt: startDate,
        endAt: endDate,
        description: `Appointment #${result.appointmentNumber}\nManage: ${manageUrl}`,
        location: tenant.tenantName,
      };

      // Resolve provider name if specified
      let providerName: string | null = null;
      if (providerId) {
        const match = service.eligibleProviders.find((p) => p.providerId === providerId);
        if (match && 'providerName' in match) {
          providerName = (match as { providerName?: string }).providerName ?? null;
        }
      }

      const sent = await sendSpaConfirmationEmail(guestEmail.trim().toLowerCase(), {
        spaName: tenant.tenantName,
        logoUrl: widgetConfig?.logoUrl ?? null,
        guestName: guestName.trim(),
        appointmentNumber: result.appointmentNumber,
        serviceName,
        providerName,
        startAt: startDate,
        endAt: endDate,
        durationMinutes: service.durationMinutes,
        priceCents,
        depositAmountCents: depositInfo?.amountCents ?? null,
        cancellationWindowHours: widgetConfig?.cancellationWindowHours ?? null,
        cancellationFeeType: widgetConfig?.cancellationFeeType ?? null,
        cancellationFeeValue: widgetConfig?.cancellationFeeValue
          ? Math.round(parseFloat(widgetConfig.cancellationFeeValue) * 100)
          : null,
        manageUrl,
        googleCalendarUrl: buildGoogleCalendarUrl(calendarEvent),
        outlookCalendarUrl: buildOutlookCalendarUrl(calendarEvent),
        welcomeMessage: widgetConfig?.welcomeMessage ?? null,
      });

      if (sent) {
        try {
          await updateAppointment(tenant.tenantId, result.id, {
            confirmationEmailSentAt: new Date(),
          });
        } catch (dbErr) {
          console.error('[spa-email] Failed to update confirmation_email_sent_at:', dbErr);
        }
      }
    } catch (emailErr) {
      console.error('[spa-email] Failed to send confirmation email:', emailErr);
    }

    return NextResponse.json(
      {
        data: {
          appointmentId: result.id,
          appointmentNumber: result.appointmentNumber,
          managementToken,
          status: 'scheduled',
          startAt: startDate.toISOString(),
          endAt: endDate.toISOString(),
          service: {
            name: service.displayName ?? service.name,
            durationMinutes: service.durationMinutes,
            priceCents,
          },
          deposit: depositInfo
            ? {
                required: depositInfo.required,
                amountCents: depositInfo.amountCents,
                depositType: depositInfo.depositType,
                status: depositInfo.status,
              }
            : null,
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    // Handle specific error types
    if (err && typeof err === 'object' && 'code' in err) {
      const appErr = err as { code: string; message: string; statusCode?: number };

      if (appErr.code === 'SCHEDULING_CONFLICT') {
        return NextResponse.json(
          { error: { code: 'SCHEDULING_CONFLICT', message: 'This time slot is no longer available. Please select a different time.' } },
          { status: 409 },
        );
      }

      if (appErr.code === 'VALIDATION_ERROR') {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: appErr.message } },
          { status: 400 },
        );
      }

      if (appErr.code === 'NOT_FOUND') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: appErr.message } },
          { status: 404 },
        );
      }
    }

    console.error('[spa-public] book error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create booking. Please try again.' } },
      { status: 500 },
    );
  }
}
