import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import {
  withTenant,
  spaAppointments,
  spaAppointmentItems,
  spaServices,
} from '@oppsera/db';

export interface OnlineBookingStatsInput {
  tenantId: string;
  locationId?: string;
  /** Start of date range (defaults to start of current month) */
  from?: Date;
  /** End of date range (defaults to now) */
  to?: Date;
}

export interface OnlineBookingStats {
  /** Total online bookings in period */
  totalBookings: number;
  /** Online bookings today */
  bookingsToday: number;
  /** Upcoming online appointments (scheduled/confirmed, start > now) */
  upcomingCount: number;
  /** Revenue from online bookings in period (cents) */
  revenueCents: number;
  /** Cancellation count in period */
  cancellationCount: number;
  /** Cancellation rate as percentage */
  cancellationRate: number;
  /** Recent online bookings (last 20) */
  recentBookings: RecentOnlineBooking[];
}

export interface RecentOnlineBooking {
  id: string;
  appointmentNumber: string;
  guestName: string | null;
  guestEmail: string | null;
  serviceName: string | null;
  providerName: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  depositAmountCents: number;
  createdAt: Date;
}

export async function getOnlineBookingStats(
  input: OnlineBookingStatsInput,
): Promise<OnlineBookingStats> {
  const { tenantId, locationId } = input;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = input.from ?? startOfMonth;
  const to = input.to ?? now;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60_000);

  return withTenant(tenantId, async (tx) => {
    const baseConditions = [
      eq(spaAppointments.tenantId, tenantId),
      eq(spaAppointments.bookingSource, 'online'),
    ];
    if (locationId) {
      baseConditions.push(eq(spaAppointments.locationId, locationId));
    }

    const [periodStats, todayStats, upcomingStats, recentRows] = await Promise.all([
      // Period stats: total bookings + cancellations + revenue
      tx
        .select({
          totalBookings: sql<number>`count(*)::int`,
          cancellationCount: sql<number>`count(*) FILTER (WHERE ${spaAppointments.status} IN ('canceled', 'no_show'))::int`,
          revenueCents: sql<number>`coalesce(sum(${spaAppointments.depositAmountCents}) FILTER (WHERE ${spaAppointments.status} NOT IN ('canceled', 'no_show')), 0)::int`,
        })
        .from(spaAppointments)
        .where(
          and(
            ...baseConditions,
            gte(spaAppointments.createdAt, from),
            lte(spaAppointments.createdAt, to),
          ),
        ),

      // Today's bookings count
      tx
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(spaAppointments)
        .where(
          and(
            ...baseConditions,
            gte(spaAppointments.createdAt, startOfToday),
            lte(spaAppointments.createdAt, endOfToday),
          ),
        ),

      // Upcoming appointments
      tx
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(spaAppointments)
        .where(
          and(
            ...baseConditions,
            inArray(spaAppointments.status, ['scheduled', 'confirmed']),
            gte(spaAppointments.startAt, now),
          ),
        ),

      // Recent bookings (last 20)
      tx
        .select({
          id: spaAppointments.id,
          appointmentNumber: spaAppointments.appointmentNumber,
          guestName: spaAppointments.guestName,
          guestEmail: spaAppointments.guestEmail,
          startAt: spaAppointments.startAt,
          endAt: spaAppointments.endAt,
          status: spaAppointments.status,
          depositAmountCents: spaAppointments.depositAmountCents,
          createdAt: spaAppointments.createdAt,
          serviceName: spaServices.displayName,
          providerName: sql<string | null>`null`.as('provider_name'),
        })
        .from(spaAppointments)
        .leftJoin(
          spaAppointmentItems,
          and(
            eq(spaAppointmentItems.appointmentId, spaAppointments.id),
            sql`${spaAppointmentItems.id} = (
              SELECT ai2.id FROM spa_appointment_items ai2
              WHERE ai2.appointment_id = ${spaAppointments.id}
              ORDER BY ai2.created_at ASC
              LIMIT 1
            )`,
          ),
        )
        .leftJoin(spaServices, eq(spaAppointmentItems.serviceId, spaServices.id))
        .where(and(...baseConditions))
        .orderBy(sql`${spaAppointments.createdAt} DESC`)
        .limit(20),
    ]);

    const total = periodStats[0]?.totalBookings ?? 0;
    const cancellations = periodStats[0]?.cancellationCount ?? 0;

    return {
      totalBookings: total,
      bookingsToday: todayStats[0]?.count ?? 0,
      upcomingCount: upcomingStats[0]?.count ?? 0,
      revenueCents: periodStats[0]?.revenueCents ?? 0,
      cancellationCount: cancellations,
      cancellationRate: total > 0 ? Math.round((cancellations / total) * 100) : 0,
      recentBookings: recentRows.map((r) => ({
        id: r.id,
        appointmentNumber: r.appointmentNumber,
        guestName: r.guestName ?? null,
        guestEmail: r.guestEmail ?? null,
        serviceName: r.serviceName ?? null,
        providerName: r.providerName ?? null,
        startAt: r.startAt,
        endAt: r.endAt,
        status: r.status,
        depositAmountCents: r.depositAmountCents,
        createdAt: r.createdAt,
      })),
    };
  });
}
