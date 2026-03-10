/**
 * Comprehensive Managers Report — single business date with MTD & YTD aggregates.
 *
 * Sections: Revenue, Payments, Room Inventory, Guest Activity, Statistics, 7-Day Forecast.
 * Inspired by Jonas Chorum "Managers Report" layout, adapted for OppsEra data model.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { withTenant, sqlArray } from '@oppsera/db';
import {
  pmsProperties,
  pmsReservations,
  pmsRooms,
  pmsFolioEntries,
  pmsFolios,
} from '@oppsera/db';

// ── Types ──────────────────────────────────────────────────────────

export interface TimePeriodValue {
  today: number;
  ptd: number;
  ytd: number;
}

export interface ManagersReportRevenue {
  roomRevenueCents: TimePeriodValue;
  otherRevenueCents: TimePeriodValue;
  adjustmentsCents: TimePeriodValue;
  totalNetRevenueCents: TimePeriodValue;
  taxesCents: TimePeriodValue;
  feesCents: TimePeriodValue;
}

export interface ManagersReportPayments {
  paymentsCents: TimePeriodValue;
  refundsCents: TimePeriodValue;
  netPaymentsCents: TimePeriodValue;
}

export interface ManagersReportRoomInventory {
  totalRooms: number;
  vacantRooms: number;
  occupiedRooms: number;
  groupRoomsOccupied: number;
  outOfOrderRooms: number;
}

export interface ManagersReportGuestActivity {
  arrivals: TimePeriodValue;
  walkInArrivals: TimePeriodValue;
  groupArrivals: TimePeriodValue;
  departures: TimePeriodValue;
  stayovers: number; // point-in-time (today only)
  noShows: TimePeriodValue;
  cancellations: TimePeriodValue;
}

export interface ManagersReportStatistics {
  roomsSold: TimePeriodValue;
  occupancyPct: TimePeriodValue;
  occupancyPctWithoutOoo: TimePeriodValue;
  adrCents: TimePeriodValue;
  revParCents: TimePeriodValue;
  avgLos: TimePeriodValue;
}

export interface ManagersReportForecastDay {
  date: string;
  arrivals: number;
  departures: number;
  stayovers: number;
  roomsSold: number;
  occupancyPct: number;
  adrCents: number;
  revParCents: number;
}

export interface ManagersReportResult {
  businessDate: string;
  propertyName: string;
  revenue: ManagersReportRevenue;
  payments: ManagersReportPayments;
  roomInventory: ManagersReportRoomInventory;
  guestActivity: ManagersReportGuestActivity;
  statistics: ManagersReportStatistics;
  forecast: ManagersReportForecastDay[];
}

// ── Constants ─────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Defensive limit on reservation queries to prevent unbounded scans */
const MAX_RESERVATION_ROWS = 50_000;

/** Defensive limit on forecast reservation fetch */
const MAX_FORECAST_ROWS = 10_000;

const ACTIVE_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];
const EXCLUDED_STATUSES = ['CANCELLED', 'NO_SHOW'];

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Derive month-start and year-start from a validated YYYY-MM-DD string.
 * Returns null if the input is malformed.
 */
function deriveDateBounds(businessDate: string): { monthStart: string; yearStart: string } | null {
  if (!DATE_RE.test(businessDate)) return null;
  const year = businessDate.slice(0, 4);
  const monthPrefix = businessDate.slice(0, 7); // YYYY-MM
  return {
    monthStart: `${monthPrefix}-01`,
    yearStart: `${year}-01-01`,
  };
}

function daysInRange(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round(numerator / denominator) : 0;
}

function safePct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
}

// ── Main Query ─────────────────────────────────────────────────────

const ZERO_TPV: TimePeriodValue = { today: 0, ptd: 0, ytd: 0 };

const EMPTY_RESULT = (businessDate: string): ManagersReportResult => ({
  businessDate,
  propertyName: '',
  revenue: {
    roomRevenueCents: { ...ZERO_TPV },
    otherRevenueCents: { ...ZERO_TPV },
    adjustmentsCents: { ...ZERO_TPV },
    totalNetRevenueCents: { ...ZERO_TPV },
    taxesCents: { ...ZERO_TPV },
    feesCents: { ...ZERO_TPV },
  },
  payments: {
    paymentsCents: { ...ZERO_TPV },
    refundsCents: { ...ZERO_TPV },
    netPaymentsCents: { ...ZERO_TPV },
  },
  roomInventory: { totalRooms: 0, vacantRooms: 0, occupiedRooms: 0, groupRoomsOccupied: 0, outOfOrderRooms: 0 },
  guestActivity: {
    arrivals: { ...ZERO_TPV },
    walkInArrivals: { ...ZERO_TPV },
    groupArrivals: { ...ZERO_TPV },
    departures: { ...ZERO_TPV },
    stayovers: 0,
    noShows: { ...ZERO_TPV },
    cancellations: { ...ZERO_TPV },
  },
  statistics: {
    roomsSold: { ...ZERO_TPV },
    occupancyPct: { ...ZERO_TPV },
    occupancyPctWithoutOoo: { ...ZERO_TPV },
    adrCents: { ...ZERO_TPV },
    revParCents: { ...ZERO_TPV },
    avgLos: { ...ZERO_TPV },
  },
  forecast: [],
});

export async function getManagersReport(
  tenantId: string,
  propertyId: string,
  businessDate: string,
): Promise<ManagersReportResult> {
  // ── Input validation ────────────────────────────────────────────
  const bounds = deriveDateBounds(businessDate);
  if (!bounds) return EMPTY_RESULT(businessDate);
  const { monthStart, yearStart } = bounds;

  return withTenant(tenantId, async (tx) => {
    // ── 1. Property name ─────────────────────────────────────────
    const [prop] = await tx
      .select({ name: pmsProperties.name })
      .from(pmsProperties)
      .where(and(eq(pmsProperties.tenantId, tenantId), eq(pmsProperties.id, propertyId)));
    const propertyName = prop?.name ?? 'Unknown Property';

    // ── 2. Room counts ───────────────────────────────────────────
    const [roomCounts] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        ooo: sql<number>`count(*) filter (where ${pmsRooms.isOutOfOrder} = true)::int`,
      })
      .from(pmsRooms)
      .where(and(eq(pmsRooms.tenantId, tenantId), eq(pmsRooms.propertyId, propertyId)));
    const totalRooms = roomCounts?.total ?? 0;
    const outOfOrderRooms = roomCounts?.ooo ?? 0;

    // ── 3. Revenue / Tax / Fee / Adjustments (Today/PTD/YTD) ─────
    const [revRow] = await tx
      .select({
        // Room Revenue (ROOM_CHARGE entries)
        roomToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'ROOM_CHARGE' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        roomPtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'ROOM_CHARGE' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        roomYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'ROOM_CHARGE' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // Other Revenue (not ROOM_CHARGE, TAX, FEE, PAYMENT, REFUND, ADJUSTMENT)
        otherToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} not in ('ROOM_CHARGE','TAX','FEE','PAYMENT','REFUND','ADJUSTMENT') then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        otherPtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} not in ('ROOM_CHARGE','TAX','FEE','PAYMENT','REFUND','ADJUSTMENT') then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        otherYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} not in ('ROOM_CHARGE','TAX','FEE','PAYMENT','REFUND','ADJUSTMENT') then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // Adjustments
        adjToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        adjPtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        adjYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'ADJUSTMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // Taxes
        taxToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'TAX' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        taxPtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'TAX' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        taxYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'TAX' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // Fees
        feeToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'FEE' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        feePtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'FEE' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        feeYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'FEE' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // Payments
        payToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'PAYMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        payPtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'PAYMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        payYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'PAYMENT' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        // Refunds
        refToday: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} = ${businessDate} and ${pmsFolioEntries.entryType} = 'REFUND' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        refPtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.businessDate} >= ${monthStart} and ${pmsFolioEntries.entryType} = 'REFUND' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
        refYtd: sql<number>`coalesce(sum(case when ${pmsFolioEntries.entryType} = 'REFUND' then ${pmsFolioEntries.amountCents} else 0 end), 0)::int`,
      })
      .from(pmsFolioEntries)
      .innerJoin(pmsFolios, eq(pmsFolioEntries.folioId, pmsFolios.id))
      .where(
        and(
          eq(pmsFolioEntries.tenantId, tenantId),
          // Defense-in-depth: filter both sides of the join by tenant
          eq(pmsFolios.tenantId, tenantId),
          eq(pmsFolios.propertyId, propertyId),
          gte(pmsFolioEntries.businessDate, yearStart),
          lte(pmsFolioEntries.businessDate, businessDate),
        ),
      );

    const roomRevenueCents: TimePeriodValue = {
      today: revRow?.roomToday ?? 0,
      ptd: revRow?.roomPtd ?? 0,
      ytd: revRow?.roomYtd ?? 0,
    };
    const otherRevenueCents: TimePeriodValue = {
      today: revRow?.otherToday ?? 0,
      ptd: revRow?.otherPtd ?? 0,
      ytd: revRow?.otherYtd ?? 0,
    };
    const adjustmentsCents: TimePeriodValue = {
      today: revRow?.adjToday ?? 0,
      ptd: revRow?.adjPtd ?? 0,
      ytd: revRow?.adjYtd ?? 0,
    };
    const taxesCents: TimePeriodValue = {
      today: revRow?.taxToday ?? 0,
      ptd: revRow?.taxPtd ?? 0,
      ytd: revRow?.taxYtd ?? 0,
    };
    const feesCents: TimePeriodValue = {
      today: revRow?.feeToday ?? 0,
      ptd: revRow?.feePtd ?? 0,
      ytd: revRow?.feeYtd ?? 0,
    };
    const paymentsCents: TimePeriodValue = {
      today: revRow?.payToday ?? 0,
      ptd: revRow?.payPtd ?? 0,
      ytd: revRow?.payYtd ?? 0,
    };
    const refundsCents: TimePeriodValue = {
      today: revRow?.refToday ?? 0,
      ptd: revRow?.refPtd ?? 0,
      ytd: revRow?.refYtd ?? 0,
    };

    const totalNetRevenueCents: TimePeriodValue = {
      today: roomRevenueCents.today + otherRevenueCents.today + adjustmentsCents.today,
      ptd: roomRevenueCents.ptd + otherRevenueCents.ptd + adjustmentsCents.ptd,
      ytd: roomRevenueCents.ytd + otherRevenueCents.ytd + adjustmentsCents.ytd,
    };
    const netPaymentsCents: TimePeriodValue = {
      today: paymentsCents.today + refundsCents.today,
      ptd: paymentsCents.ptd + refundsCents.ptd,
      ytd: paymentsCents.ytd + refundsCents.ytd,
    };

    // ── 4. Guest Activity (Today/PTD/YTD) ────────────────────────
    const excludedArr = sql`ARRAY[${sql.join(EXCLUDED_STATUSES.map((s) => sql`${s}`), sql`, `)}]`;

    const [guestRow] = await tx
      .select({
        // Today
        todayArrivals: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} = ${businessDate} and ${pmsReservations.status} != all(${excludedArr}))::int`,
        todayWalkIns: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} = ${businessDate} and ${pmsReservations.sourceType} = 'WALKIN' and ${pmsReservations.status} != all(${excludedArr}))::int`,
        todayGroupArr: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} = ${businessDate} and ${pmsReservations.groupId} is not null and ${pmsReservations.status} != all(${excludedArr}))::int`,
        todayDepartures: sql<number>`count(*) filter (where ${pmsReservations.checkOutDate} = ${businessDate} and ${pmsReservations.status} != all(${excludedArr}))::int`,
        todayNoShows: sql<number>`count(*) filter (where ${pmsReservations.status} = 'NO_SHOW' and ${pmsReservations.checkInDate} = ${businessDate})::int`,
        todayCancels: sql<number>`count(*) filter (where ${pmsReservations.status} = 'CANCELLED' and ${pmsReservations.cancelledAt}::date = ${businessDate}::date)::int`,
        // PTD
        ptdArrivals: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} >= ${monthStart} and ${pmsReservations.checkInDate} <= ${businessDate} and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ptdWalkIns: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} >= ${monthStart} and ${pmsReservations.checkInDate} <= ${businessDate} and ${pmsReservations.sourceType} = 'WALKIN' and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ptdGroupArr: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} >= ${monthStart} and ${pmsReservations.checkInDate} <= ${businessDate} and ${pmsReservations.groupId} is not null and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ptdDepartures: sql<number>`count(*) filter (where ${pmsReservations.checkOutDate} >= ${monthStart} and ${pmsReservations.checkOutDate} <= ${businessDate} and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ptdNoShows: sql<number>`count(*) filter (where ${pmsReservations.status} = 'NO_SHOW' and ${pmsReservations.checkInDate} >= ${monthStart} and ${pmsReservations.checkInDate} <= ${businessDate})::int`,
        ptdCancels: sql<number>`count(*) filter (where ${pmsReservations.status} = 'CANCELLED' and ${pmsReservations.cancelledAt}::date >= ${monthStart}::date and ${pmsReservations.cancelledAt}::date <= ${businessDate}::date)::int`,
        // YTD
        ytdArrivals: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} >= ${yearStart} and ${pmsReservations.checkInDate} <= ${businessDate} and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ytdWalkIns: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} >= ${yearStart} and ${pmsReservations.checkInDate} <= ${businessDate} and ${pmsReservations.sourceType} = 'WALKIN' and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ytdGroupArr: sql<number>`count(*) filter (where ${pmsReservations.checkInDate} >= ${yearStart} and ${pmsReservations.checkInDate} <= ${businessDate} and ${pmsReservations.groupId} is not null and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ytdDepartures: sql<number>`count(*) filter (where ${pmsReservations.checkOutDate} >= ${yearStart} and ${pmsReservations.checkOutDate} <= ${businessDate} and ${pmsReservations.status} != all(${excludedArr}))::int`,
        ytdNoShows: sql<number>`count(*) filter (where ${pmsReservations.status} = 'NO_SHOW' and ${pmsReservations.checkInDate} >= ${yearStart} and ${pmsReservations.checkInDate} <= ${businessDate})::int`,
        ytdCancels: sql<number>`count(*) filter (where ${pmsReservations.status} = 'CANCELLED' and ${pmsReservations.cancelledAt}::date >= ${yearStart}::date and ${pmsReservations.cancelledAt}::date <= ${businessDate}::date)::int`,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
        ),
      );

    // Today's occupied rooms and stayovers (point-in-time)
    const todayReservations = await tx
      .select({
        checkInDate: pmsReservations.checkInDate,
        groupId: pmsReservations.groupId,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          lte(pmsReservations.checkInDate, businessDate),
          sql`${pmsReservations.checkOutDate} > ${businessDate}`,
          sql`${pmsReservations.status} = ANY(${sqlArray(ACTIVE_STATUSES)})`,
        ),
      )
      .limit(MAX_RESERVATION_ROWS);

    const occupiedRooms = todayReservations.length;
    const groupRoomsOccupied = todayReservations.filter((r) => r.groupId != null).length;
    const stayovers = todayReservations.filter((r) => r.checkInDate !== businessDate).length;

    // ── 5. Room-nights sold (PTD/YTD) for statistics ─────────────
    const [roomNightsRow] = await tx
      .select({
        ptdNights: sql<number>`coalesce(sum(greatest(0, least(${pmsReservations.checkOutDate}::date, (${businessDate}::date + 1)::date) - greatest(${pmsReservations.checkInDate}::date, ${monthStart}::date))), 0)::int`,
        ytdNights: sql<number>`coalesce(sum(greatest(0, least(${pmsReservations.checkOutDate}::date, (${businessDate}::date + 1)::date) - greatest(${pmsReservations.checkInDate}::date, ${yearStart}::date))), 0)::int`,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          lte(pmsReservations.checkInDate, businessDate),
          sql`${pmsReservations.checkOutDate} > ${yearStart}`,
          sql`${pmsReservations.status} != ALL(${excludedArr})`,
        ),
      );

    const roomsSoldToday = occupiedRooms;
    const roomsSoldPtd = roomNightsRow?.ptdNights ?? 0;
    const roomsSoldYtd = roomNightsRow?.ytdNights ?? 0;

    // ── 6. Average LOS for reservations that checked out ─────────
    const [losRow] = await tx
      .select({
        todayAvg: sql<number>`coalesce(avg(case when ${pmsReservations.checkOutDate} = ${businessDate} then ${pmsReservations.checkOutDate}::date - ${pmsReservations.checkInDate}::date end), 0)::numeric(10,2)`,
        ptdAvg: sql<number>`coalesce(avg(case when ${pmsReservations.checkOutDate} >= ${monthStart} and ${pmsReservations.checkOutDate} <= ${businessDate} then ${pmsReservations.checkOutDate}::date - ${pmsReservations.checkInDate}::date end), 0)::numeric(10,2)`,
        ytdAvg: sql<number>`coalesce(avg(case when ${pmsReservations.checkOutDate} >= ${yearStart} and ${pmsReservations.checkOutDate} <= ${businessDate} then ${pmsReservations.checkOutDate}::date - ${pmsReservations.checkInDate}::date end), 0)::numeric(10,2)`,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          sql`${pmsReservations.status} != ALL(${excludedArr})`,
          gte(pmsReservations.checkOutDate, yearStart),
          lte(pmsReservations.checkOutDate, businessDate),
        ),
      );

    // ── 7. Forecast (next 7 days) ───────────────────────────────
    const forecastStart = new Date(businessDate);
    forecastStart.setDate(forecastStart.getDate() + 1);
    const forecastEnd = new Date(businessDate);
    forecastEnd.setDate(forecastEnd.getDate() + 7);
    const fStartStr = forecastStart.toISOString().split('T')[0]!;
    const fEndStr = forecastEnd.toISOString().split('T')[0]!;

    const forecastReservations = await tx
      .select({
        checkInDate: pmsReservations.checkInDate,
        checkOutDate: pmsReservations.checkOutDate,
        nightlyRateCents: pmsReservations.nightlyRateCents,
      })
      .from(pmsReservations)
      .where(
        and(
          eq(pmsReservations.tenantId, tenantId),
          eq(pmsReservations.propertyId, propertyId),
          lte(pmsReservations.checkInDate, fEndStr),
          gte(pmsReservations.checkOutDate, fStartStr),
          sql`${pmsReservations.status} = ANY(${sqlArray(['CONFIRMED', 'CHECKED_IN'])})`,
        ),
      )
      .limit(MAX_FORECAST_ROWS);

    const forecast: ManagersReportForecastDay[] = [];
    const cur = new Date(forecastStart);
    while (cur <= forecastEnd) {
      const dateStr = cur.toISOString().split('T')[0]!;
      let occupied = 0;
      let arrivals = 0;
      let departures = 0;
      let totalRateCents = 0;

      for (const r of forecastReservations) {
        const overlaps = r.checkInDate <= dateStr && r.checkOutDate > dateStr;
        if (overlaps) {
          occupied++;
          totalRateCents += r.nightlyRateCents ?? 0;
        }
        if (r.checkInDate === dateStr) arrivals++;
        if (r.checkOutDate === dateStr) departures++;
      }

      forecast.push({
        date: dateStr,
        arrivals,
        departures,
        stayovers: Math.max(0, occupied - arrivals),
        roomsSold: occupied,
        occupancyPct: safePct(occupied, totalRooms),
        adrCents: safeDivide(totalRateCents, occupied),
        revParCents: safeDivide(totalRateCents, totalRooms),
      });

      cur.setDate(cur.getDate() + 1);
    }

    // ── Assemble result ──────────────────────────────────────────
    const ptdDays = daysInRange(monthStart, businessDate);
    const ytdDays = daysInRange(yearStart, businessDate);
    const ptdAvailableRooms = totalRooms * ptdDays;
    const ytdAvailableRooms = totalRooms * ytdDays;

    return {
      businessDate,
      propertyName,

      revenue: {
        roomRevenueCents,
        otherRevenueCents,
        adjustmentsCents,
        totalNetRevenueCents,
        taxesCents,
        feesCents,
      },

      payments: {
        paymentsCents,
        refundsCents,
        netPaymentsCents,
      },

      roomInventory: {
        totalRooms,
        vacantRooms: totalRooms - occupiedRooms,
        occupiedRooms,
        groupRoomsOccupied,
        outOfOrderRooms,
      },

      guestActivity: {
        arrivals: { today: guestRow?.todayArrivals ?? 0, ptd: guestRow?.ptdArrivals ?? 0, ytd: guestRow?.ytdArrivals ?? 0 },
        walkInArrivals: { today: guestRow?.todayWalkIns ?? 0, ptd: guestRow?.ptdWalkIns ?? 0, ytd: guestRow?.ytdWalkIns ?? 0 },
        groupArrivals: { today: guestRow?.todayGroupArr ?? 0, ptd: guestRow?.ptdGroupArr ?? 0, ytd: guestRow?.ytdGroupArr ?? 0 },
        departures: { today: guestRow?.todayDepartures ?? 0, ptd: guestRow?.ptdDepartures ?? 0, ytd: guestRow?.ytdDepartures ?? 0 },
        stayovers,
        noShows: { today: guestRow?.todayNoShows ?? 0, ptd: guestRow?.ptdNoShows ?? 0, ytd: guestRow?.ytdNoShows ?? 0 },
        cancellations: { today: guestRow?.todayCancels ?? 0, ptd: guestRow?.ptdCancels ?? 0, ytd: guestRow?.ytdCancels ?? 0 },
      },

      statistics: {
        roomsSold: { today: roomsSoldToday, ptd: roomsSoldPtd, ytd: roomsSoldYtd },
        occupancyPct: {
          today: safePct(roomsSoldToday, totalRooms),
          ptd: safePct(roomsSoldPtd, ptdAvailableRooms),
          ytd: safePct(roomsSoldYtd, ytdAvailableRooms),
        },
        occupancyPctWithoutOoo: {
          today: safePct(roomsSoldToday, totalRooms - outOfOrderRooms),
          ptd: safePct(roomsSoldPtd, (totalRooms - outOfOrderRooms) * ptdDays),
          ytd: safePct(roomsSoldYtd, (totalRooms - outOfOrderRooms) * ytdDays),
        },
        adrCents: {
          today: safeDivide(roomRevenueCents.today, roomsSoldToday),
          ptd: safeDivide(roomRevenueCents.ptd, roomsSoldPtd),
          ytd: safeDivide(roomRevenueCents.ytd, roomsSoldYtd),
        },
        revParCents: {
          today: safeDivide(roomRevenueCents.today, totalRooms),
          ptd: safeDivide(roomRevenueCents.ptd, ptdAvailableRooms),
          ytd: safeDivide(roomRevenueCents.ytd, ytdAvailableRooms),
        },
        avgLos: {
          today: Number(losRow?.todayAvg ?? 0),
          ptd: Number(losRow?.ptdAvg ?? 0),
          ytd: Number(losRow?.ytdAvg ?? 0),
        },
      },

      forecast,
    };
  });
}
