import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getEntitlementEngine } from '@oppsera/core/entitlements';
import { withTenant } from '@oppsera/db';
import { listAppointments } from '@oppsera/module-spa';
import {
  listReservationsByCustomer,
  listWaitlistByCustomer,
} from '@oppsera/module-fnb';
import type {
  CustomerReservationEntry,
  CustomerWaitlistEntry,
  CustomerReservationsData,
} from '@/types/customer-360';

function extractCustomerId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  const idx = parts.indexOf('customers');
  return parts[idx + 1]!;
}

// ── Spa mapper ──────────────────────────────────────────────────────
function mapSpaAppointment(row: Record<string, unknown>): CustomerReservationEntry {
  return {
    id: String(row.id),
    module: 'spa',
    type: 'appointment',
    title: row.serviceName ? String(row.serviceName) : 'Spa Appointment',
    date: String(row.appointmentDate ?? row.date ?? row.createdAt),
    time: row.startTime ? String(row.startTime) : null,
    endTime: row.endTime ? String(row.endTime) : null,
    status: String(row.status),
    partySize: null,
    locationId: row.locationId ? String(row.locationId) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.createdAt),
  };
}

// ── PMS mapper ──────────────────────────────────────────────────────
function mapPmsReservation(row: Record<string, unknown>): CustomerReservationEntry {
  return {
    id: String(row.id),
    module: 'pms',
    type: 'hotel',
    title: row.room_type_name
      ? `${row.room_type_name}`
      : 'Hotel Reservation',
    date: String(row.check_in_date),
    time: null,
    endTime: row.check_out_date ? String(row.check_out_date) : null,
    status: String(row.status),
    partySize: row.num_adults != null ? Number(row.num_adults) + Number(row.num_children ?? 0) : null,
    locationId: row.property_id ? String(row.property_id) : null,
    notes: row.special_requests ? String(row.special_requests) : null,
    createdAt: String(row.created_at),
  };
}

// ── F&B mapper ──────────────────────────────────────────────────────
function mapDiningReservation(row: {
  id: string;
  guestName: string;
  reservationDate: string;
  reservationTime: string;
  endTime: string | null;
  status: string;
  partySize: number;
  locationId: string;
  specialRequests: string | null;
  occasion: string | null;
  createdAt: string;
}): CustomerReservationEntry {
  return {
    id: row.id,
    module: 'dining',
    type: 'dining',
    title: row.occasion ? `Dining — ${row.occasion}` : 'Dining Reservation',
    date: row.reservationDate,
    time: row.reservationTime,
    endTime: row.endTime,
    status: row.status,
    partySize: row.partySize,
    locationId: row.locationId,
    notes: row.specialRequests,
    createdAt: row.createdAt,
  };
}

// ── Waitlist mapper ─────────────────────────────────────────────────
function mapDiningWaitlist(row: {
  id: string;
  guestName: string;
  partySize: number;
  status: string;
  position: number;
  quotedWaitMinutes: number | null;
  addedAt: string;
  seatedAt: string | null;
}): CustomerWaitlistEntry {
  return {
    id: row.id,
    module: 'dining',
    guestName: row.guestName,
    partySize: row.partySize,
    status: row.status,
    position: row.position,
    quotedWaitMinutes: row.quotedWaitMinutes,
    addedAt: row.addedAt,
    seatedAt: row.seatedAt,
  };
}

// ── PMS reservation query (two-step: customer → guests → reservations) ──
async function queryPmsReservations(
  tenantId: string,
  customerId: string,
  timeframe: string,
): Promise<CustomerReservationEntry[]> {
  return withTenant(tenantId, async (tx) => {
    // Step 1: find all PMS guest records linked to this customer
    const guestRows = await tx.execute(sql`
      SELECT id FROM pms_guests
      WHERE tenant_id = ${tenantId}
        AND customer_id = ${customerId}
    `);
    const guests = Array.from(guestRows as Iterable<Record<string, unknown>>);
    if (guests.length === 0) return [];

    const guestIds = guests.map((g) => String(g.id));

    // Step 2: query reservations for those guests
    const conditions = [
      sql`r.tenant_id = ${tenantId}`,
      sql`r.guest_id IN (${sql.join(guestIds.map((id) => sql`${id}`), sql`, `)})`,
    ];

    if (timeframe === 'upcoming') {
      conditions.push(sql`r.check_in_date >= CURRENT_DATE`);
      conditions.push(sql`r.status NOT IN ('cancelled', 'no_show', 'checked_out')`);
    } else if (timeframe === 'past') {
      conditions.push(
        sql`(r.check_out_date < CURRENT_DATE OR r.status IN ('checked_out', 'cancelled', 'no_show'))`,
      );
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(sql`
      SELECT
        r.id,
        r.check_in_date,
        r.check_out_date,
        r.status,
        r.num_adults,
        r.num_children,
        r.special_requests,
        r.created_at,
        r.property_id,
        rt.name AS room_type_name
      FROM pms_reservations r
      LEFT JOIN pms_room_types rt ON rt.id = r.room_type_id
      WHERE ${whereClause}
      ORDER BY r.check_in_date DESC
      LIMIT 50
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map(mapPmsReservation);
  });
}

// GET /api/v1/customers/:id/reservations
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const customerId = extractCustomerId(request);
    const url = new URL(request.url);
    const timeframe = url.searchParams.get('timeframe') ?? 'all';

    const engine = getEntitlementEngine();

    // Check which modules the tenant has enabled (parallel)
    const [hasSpa, hasPms, hasFnb] = await Promise.all([
      engine.isModuleEnabled(ctx.tenantId, 'spa'),
      engine.isModuleEnabled(ctx.tenantId, 'pms'),
      engine.isModuleEnabled(ctx.tenantId, 'pos_fnb'),
    ]);

    // Build queries for enabled modules only
    const queries: Record<string, Promise<unknown>> = {};

    if (hasSpa) {
      queries.spa = listAppointments({
        tenantId: ctx.tenantId,
        customerId,
        limit: 50,
      });
    }

    if (hasPms) {
      queries.pms = queryPmsReservations(ctx.tenantId, customerId, timeframe);
    }

    if (hasFnb) {
      queries.dining = listReservationsByCustomer(ctx.tenantId, customerId, {
        timeframe: timeframe as 'upcoming' | 'past' | 'all',
        limit: 50,
      });
      queries.waitlist = listWaitlistByCustomer(ctx.tenantId, customerId, {
        timeframe: timeframe as 'upcoming' | 'past' | 'all',
        limit: 50,
      });
    }

    // Execute all in parallel — one module failure doesn't break the rest
    const keys = Object.keys(queries);
    const results = await Promise.allSettled(Object.values(queries));

    const resultMap: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      const result = results[i]!;
      if (result.status === 'fulfilled') {
        resultMap[key] = result.value;
      }
    });

    // Map results to unified shape
    const data: CustomerReservationsData = {
      spa: [],
      hotel: [],
      dining: [],
      golf: [],
      waitlist: [],
    };

    // Spa appointments → reservations
    if (resultMap.spa) {
      const spaResult = resultMap.spa as { items: Record<string, unknown>[] };
      data.spa = (spaResult.items ?? []).map(mapSpaAppointment);
    }

    // PMS reservations
    if (resultMap.pms) {
      data.hotel = resultMap.pms as CustomerReservationEntry[];
    }

    // F&B dining reservations
    if (resultMap.dining) {
      const diningResult = resultMap.dining as { items: Array<{
        id: string; guestName: string; reservationDate: string;
        reservationTime: string; endTime: string | null; status: string;
        partySize: number; locationId: string; specialRequests: string | null;
        occasion: string | null; createdAt: string;
      }> };
      data.dining = (diningResult.items ?? []).map(mapDiningReservation);
    }

    // F&B waitlist
    if (resultMap.waitlist) {
      const waitlistResult = resultMap.waitlist as { items: Array<{
        id: string; guestName: string; partySize: number; status: string;
        position: number; quotedWaitMinutes: number | null;
        addedAt: string; seatedAt: string | null;
      }> };
      data.waitlist = (waitlistResult.items ?? []).map(mapDiningWaitlist);
    }

    return NextResponse.json({ data });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);
