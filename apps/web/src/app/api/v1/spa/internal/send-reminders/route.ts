import { NextResponse } from 'next/server';
import {
  db,
  sql,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
  spaProviders,
  spaBookingWidgetConfig,
  tenants,
  withTenant,
} from '@oppsera/db';
import { eq, and, inArray, isNull, gte, lte } from 'drizzle-orm';
import { sendSpaReminderEmail } from '@oppsera/core/email/spa-email-service';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from '@oppsera/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/v1/spa/internal/send-reminders
 *
 * Vercel Cron route — sends reminder emails for upcoming spa appointments.
 *
 * Queries all tenants for appointments within the reminder window (default 24h)
 * that have not yet received a reminder email.
 *
 * Idempotent via `reminder_email_sent_at IS NULL` filter + atomic UPDATE on success.
 *
 * All DB operations are awaited before response (Vercel safety — gotcha #466).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: {
    checked: number;
    sent: number;
    failed: number;
    errors: string[];
  } = { checked: 0, sent: 0, failed: 0, errors: [] };

  try {
    const now = new Date();
    // Default reminder window: 24 hours from now
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60_000);

    // ── Step 1: Find upcoming appointments needing reminders ─────────
    // Cross-tenant query (no RLS context) — same pattern as drain-outbox
    const appointments = await db
      .select({
        id: spaAppointments.id,
        tenantId: spaAppointments.tenantId,
        appointmentNumber: spaAppointments.appointmentNumber,
        guestName: spaAppointments.guestName,
        guestEmail: spaAppointments.guestEmail,
        startAt: spaAppointments.startAt,
        endAt: spaAppointments.endAt,
        status: spaAppointments.status,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(spaAppointments)
      .innerJoin(tenants, eq(spaAppointments.tenantId, tenants.id))
      .where(
        and(
          inArray(spaAppointments.status, ['scheduled', 'confirmed']),
          gte(spaAppointments.startAt, now),
          lte(spaAppointments.startAt, windowEnd),
          isNull(spaAppointments.reminderEmailSentAt),
          sql`${spaAppointments.guestEmail} IS NOT NULL`,
        ),
      )
      .limit(100);

    results.checked = appointments.length;

    if (appointments.length === 0) {
      return NextResponse.json({ status: 'ok', ...results });
    }

    // ── Step 2: Process each appointment ─────────────────────────────
    for (const appt of appointments) {
      try {
        // Per-tenant DB operations wrapped in withTenant for RLS enforcement
        const { serviceName, providerName, durationMinutes, widgetConfig } = await withTenant(
          appt.tenantId,
          async (tx) => {
            // Fetch the first service item for this appointment
            const [firstItem] = await tx
              .select({
                serviceName: spaServices.name,
                serviceDisplayName: spaServices.displayName,
                durationMinutes: spaServices.durationMinutes,
                providerName: spaProviders.displayName,
              })
              .from(spaAppointmentItems)
              .innerJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
              .leftJoin(spaProviders, eq(spaAppointmentItems.providerId, spaProviders.id))
              .where(eq(spaAppointmentItems.appointmentId, appt.id))
              .limit(1);

            // Fetch widget config for branding + cancellation policy
            const [wc] = await tx
              .select({
                logoUrl: spaBookingWidgetConfig.logoUrl,
                welcomeMessage: spaBookingWidgetConfig.welcomeMessage,
                cancellationWindowHours: spaBookingWidgetConfig.cancellationWindowHours,
              })
              .from(spaBookingWidgetConfig)
              .where(
                and(
                  eq(spaBookingWidgetConfig.tenantId, appt.tenantId),
                  eq(spaBookingWidgetConfig.isActive, true),
                ),
              )
              .limit(1);

            return {
              serviceName: firstItem?.serviceDisplayName ?? firstItem?.serviceName ?? 'Appointment',
              providerName: firstItem?.providerName ?? null,
              durationMinutes: firstItem?.durationMinutes ?? 60,
              widgetConfig: wc ?? null,
            };
          },
        );

        // Build manage URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.oppsera.com';
        const manageUrl = `${baseUrl}/book/${appt.tenantSlug}/spa/manage/${appt.appointmentNumber}`;

        // Build calendar links
        const calendarEvent = {
          title: `${serviceName} at ${appt.tenantName}`,
          startAt: appt.startAt,
          endAt: appt.endAt,
          description: `Appointment #${appt.appointmentNumber}\nManage: ${manageUrl}`,
          location: appt.tenantName,
        };

        const sent = await sendSpaReminderEmail(appt.guestEmail!, {
          spaName: appt.tenantName,
          logoUrl: widgetConfig?.logoUrl ?? null,
          guestName: appt.guestName ?? 'Guest',
          appointmentNumber: appt.appointmentNumber,
          serviceName,
          providerName,
          startAt: appt.startAt,
          endAt: appt.endAt,
          durationMinutes,
          manageUrl,
          googleCalendarUrl: buildGoogleCalendarUrl(calendarEvent),
          outlookCalendarUrl: buildOutlookCalendarUrl(calendarEvent),
          welcomeMessage: widgetConfig?.welcomeMessage ?? null,
          cancellationWindowHours: widgetConfig?.cancellationWindowHours ?? null,
        });

        if (sent) {
          // Mark reminder as sent — wrapped in withTenant for RLS
          await withTenant(appt.tenantId, async (tx) => {
            await tx
              .update(spaAppointments)
              .set({ reminderEmailSentAt: new Date() })
              .where(eq(spaAppointments.id, appt.id));
          });

          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`Email send returned false for ${appt.appointmentNumber}`);
        }
      } catch (apptErr) {
        results.failed++;
        const msg = apptErr instanceof Error ? apptErr.message : 'Unknown error';
        results.errors.push(`${appt.appointmentNumber}: ${msg}`);
        console.error(`[spa-reminders] Failed for ${appt.appointmentNumber}:`, apptErr);
      }
    }

    return NextResponse.json({ status: 'ok', ...results });
  } catch (error) {
    console.error('[spa-reminders] Cron error:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error', ...results },
      { status: 500 },
    );
  }
}
