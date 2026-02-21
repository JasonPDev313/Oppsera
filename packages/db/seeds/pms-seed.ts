/**
 * PMS Seed Data — Lakeside Lodge & Resort
 *
 * Creates a realistic property with:
 * - 1 property
 * - 5 room types
 * - 30 rooms
 * - 1 default rate plan with prices
 * - 10 guests
 * - 15-20 reservations (mix of statuses)
 * - Room blocks for reservations with rooms
 * - Folios for confirmed+ reservations
 *
 * Idempotent: checks for existing data before inserting.
 */
import { sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

interface SeedContext {
  tenantId: string;
  userId: string;
}

export async function seedPmsData(db: PostgresJsDatabase, ctx: SeedContext) {
  const { tenantId, userId } = ctx;

  // Check if PMS data already exists for this tenant
  const existing = await db.execute(sql`
    SELECT id FROM pms_properties WHERE tenant_id = ${tenantId} LIMIT 1
  `);
  if (Array.from(existing as Iterable<any>).length > 0) {
    console.log('[pms-seed] PMS data already exists for this tenant, skipping');
    return;
  }

  // ── Property ──────────────────────────────────────────────────
  const propertyId = generateUlid();
  await db.execute(sql`
    INSERT INTO pms_properties (id, tenant_id, name, timezone, currency, tax_rate_pct, check_in_time, check_out_time, night_audit_time, created_by)
    VALUES (${propertyId}, ${tenantId}, 'Lakeside Lodge & Resort', 'America/New_York', 'USD', '8.50', '15:00', '11:00', '03:00', ${userId})
  `);

  // ── Room Types ────────────────────────────────────────────────
  const roomTypes = [
    { code: 'STD', name: 'Standard Room', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, beds: [{ type: 'queen', count: 1 }], sort: 1, rateCents: 14900 },
    { code: 'DLX', name: 'Deluxe Room', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, beds: [{ type: 'queen', count: 2 }], sort: 2, rateCents: 19900 },
    { code: 'STE', name: 'Suite', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, beds: [{ type: 'king', count: 1 }, { type: 'sofa', count: 1 }], sort: 3, rateCents: 29900 },
    { code: 'FAM', name: 'Family Room', maxAdults: 2, maxChildren: 3, maxOccupancy: 5, beds: [{ type: 'queen', count: 1 }, { type: 'bunk', count: 1 }], sort: 4, rateCents: 24900 },
    { code: 'PRS', name: 'Presidential Suite', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, beds: [{ type: 'king', count: 1 }], sort: 5, rateCents: 49900 },
  ];

  const rtIds: Record<string, string> = {};
  for (const rt of roomTypes) {
    const id = generateUlid();
    rtIds[rt.code] = id;
    await db.execute(sql`
      INSERT INTO pms_room_types (id, tenant_id, property_id, code, name, max_adults, max_children, max_occupancy, beds_json, sort_order, created_by)
      VALUES (${id}, ${tenantId}, ${propertyId}, ${rt.code}, ${rt.name}, ${rt.maxAdults}, ${rt.maxChildren}, ${rt.maxOccupancy}, ${JSON.stringify(rt.beds)}::jsonb, ${rt.sort}, ${userId})
    `);
  }

  // ── Rooms ─────────────────────────────────────────────────────
  const roomDefs: Array<{ number: string; floor: string; typeCode: string }> = [];
  // STD: 101-110
  for (let i = 1; i <= 10; i++) roomDefs.push({ number: `${100 + i}`, floor: '1', typeCode: 'STD' });
  // DLX: 201-208
  for (let i = 1; i <= 8; i++) roomDefs.push({ number: `${200 + i}`, floor: '2', typeCode: 'DLX' });
  // STE: 301-305
  for (let i = 1; i <= 5; i++) roomDefs.push({ number: `${300 + i}`, floor: '3', typeCode: 'STE' });
  // FAM: 401-404
  for (let i = 1; i <= 4; i++) roomDefs.push({ number: `${400 + i}`, floor: '4', typeCode: 'FAM' });
  // PRS: 501-503
  for (let i = 1; i <= 3; i++) roomDefs.push({ number: `${500 + i}`, floor: '5', typeCode: 'PRS' });

  const roomIds: Record<string, string> = {};
  for (const rm of roomDefs) {
    const id = generateUlid();
    roomIds[rm.number] = id;
    await db.execute(sql`
      INSERT INTO pms_rooms (id, tenant_id, property_id, room_type_id, room_number, floor, created_by)
      VALUES (${id}, ${tenantId}, ${propertyId}, ${rtIds[rm.typeCode]!}, ${rm.number}, ${rm.floor}, ${userId})
    `);
  }

  // Set rooms 109, 110 as OUT_OF_ORDER
  for (const num of ['109', '110']) {
    await db.execute(sql`
      UPDATE pms_rooms SET status = 'OUT_OF_ORDER', is_out_of_order = true, out_of_order_reason = 'Renovation' WHERE id = ${roomIds[num]!}
    `);
  }

  // ── Rate Plan ─────────────────────────────────────────────────
  const ratePlanId = generateUlid();
  await db.execute(sql`
    INSERT INTO pms_rate_plans (id, tenant_id, property_id, code, name, is_default, created_by)
    VALUES (${ratePlanId}, ${tenantId}, ${propertyId}, 'RACK', 'Rack Rate', true, ${userId})
  `);

  // Rate plan prices (valid for the next year)
  const today = new Date();
  const startDate = today.toISOString().split('T')[0]!;
  const endD = new Date(today);
  endD.setFullYear(endD.getFullYear() + 1);
  const endDate = endD.toISOString().split('T')[0]!;

  for (const rt of roomTypes) {
    await db.execute(sql`
      INSERT INTO pms_rate_plan_prices (id, tenant_id, rate_plan_id, room_type_id, start_date, end_date, nightly_base_cents)
      VALUES (${generateUlid()}, ${tenantId}, ${ratePlanId}, ${rtIds[rt.code]!}, ${startDate}, ${endDate}, ${rt.rateCents})
    `);
  }

  // ── Guests ────────────────────────────────────────────────────
  const guestDefs = [
    { first: 'John', last: 'Smith', email: 'john.smith@example.com', phone: '+1-555-0101', vip: false },
    { first: 'Sarah', last: 'Johnson', email: 'sarah.j@example.com', phone: '+1-555-0102', vip: true },
    { first: 'Michael', last: 'Williams', email: 'mwilliams@example.com', phone: '+1-555-0103', vip: false },
    { first: 'Emily', last: 'Brown', email: 'emily.b@example.com', phone: '+1-555-0104', vip: false },
    { first: 'David', last: 'Jones', email: 'djones@example.com', phone: '+1-555-0105', vip: true },
    { first: 'Lisa', last: 'Garcia', email: 'lisa.garcia@example.com', phone: '+1-555-0106', vip: false },
    { first: 'Robert', last: 'Martinez', email: 'rmartinez@example.com', phone: '+1-555-0107', vip: false },
    { first: 'Jennifer', last: 'Davis', email: 'jdavis@example.com', phone: '+1-555-0108', vip: false },
    { first: 'William', last: 'Anderson', email: 'wanderson@example.com', phone: '+1-555-0109', vip: true },
    { first: 'Amanda', last: 'Taylor', email: 'ataylor@example.com', phone: '+1-555-0110', vip: false },
  ];

  const guestIds: string[] = [];
  for (const g of guestDefs) {
    const id = generateUlid();
    guestIds.push(id);
    await db.execute(sql`
      INSERT INTO pms_guests (id, tenant_id, property_id, first_name, last_name, email, phone, is_vip, created_by)
      VALUES (${id}, ${tenantId}, ${propertyId}, ${g.first}, ${g.last}, ${g.email}, ${g.phone}, ${g.vip}, ${userId})
    `);
  }

  // ── Reservations ──────────────────────────────────────────────
  function addDays(d: Date, n: number): Date {
    const result = new Date(d);
    result.setDate(result.getDate() + n);
    return result;
  }
  function fmt(d: Date): string {
    return d.toISOString().split('T')[0]!;
  }

  const now = new Date();
  const resDefs = [
    // Checked in currently
    { gIdx: 0, room: '101', rtCode: 'STD', ciOff: -2, coOff: 3, status: 'CHECKED_IN', source: 'DIRECT' },
    { gIdx: 1, room: '201', rtCode: 'DLX', ciOff: -1, coOff: 4, status: 'CHECKED_IN', source: 'PHONE' },
    { gIdx: 2, room: '301', rtCode: 'STE', ciOff: -3, coOff: 1, status: 'CHECKED_IN', source: 'BOOKING_ENGINE' },
    // Confirmed future
    { gIdx: 3, room: '102', rtCode: 'STD', ciOff: 2, coOff: 5, status: 'CONFIRMED', source: 'DIRECT' },
    { gIdx: 4, room: '202', rtCode: 'DLX', ciOff: 5, coOff: 8, status: 'CONFIRMED', source: 'OTA' },
    { gIdx: 5, room: '401', rtCode: 'FAM', ciOff: 7, coOff: 14, status: 'CONFIRMED', source: 'PHONE' },
    { gIdx: 6, room: null, rtCode: 'STD', ciOff: 10, coOff: 13, status: 'CONFIRMED', source: 'BOOKING_ENGINE' },
    { gIdx: 7, room: '501', rtCode: 'PRS', ciOff: 3, coOff: 7, status: 'CONFIRMED', source: 'DIRECT' },
    // Holds
    { gIdx: 8, room: null, rtCode: 'DLX', ciOff: 14, coOff: 17, status: 'HOLD', source: 'PHONE' },
    { gIdx: 9, room: null, rtCode: 'STE', ciOff: 20, coOff: 23, status: 'HOLD', source: 'DIRECT' },
    // Cancelled
    { gIdx: 0, room: null, rtCode: 'STD', ciOff: 15, coOff: 18, status: 'CANCELLED', source: 'OTA' },
    { gIdx: 3, room: null, rtCode: 'DLX', ciOff: 8, coOff: 10, status: 'CANCELLED', source: 'DIRECT' },
    // Checked out (past)
    { gIdx: 1, room: '103', rtCode: 'STD', ciOff: -7, coOff: -4, status: 'CHECKED_OUT', source: 'WALKIN' },
    { gIdx: 5, room: '203', rtCode: 'DLX', ciOff: -5, coOff: -2, status: 'CHECKED_OUT', source: 'PHONE' },
    // Weekend arrivals
    { gIdx: 6, room: '302', rtCode: 'STE', ciOff: 4, coOff: 6, status: 'CONFIRMED', source: 'BOOKING_ENGINE' },
    { gIdx: 7, room: '402', rtCode: 'FAM', ciOff: 11, coOff: 14, status: 'CONFIRMED', source: 'DIRECT' },
  ];

  for (const res of resDefs) {
    const guest = guestDefs[res.gIdx]!;
    const guestId = guestIds[res.gIdx]!;
    const ci = fmt(addDays(now, res.ciOff));
    const co = fmt(addDays(now, res.coOff));
    const nights = res.coOff - res.ciOff;
    const rtEntry = roomTypes.find((r) => r.code === res.rtCode)!;
    const nightlyRateCents = rtEntry.rateCents;
    const subtotalCents = nightlyRateCents * nights;
    const taxCents = Math.round(subtotalCents * 8.5 / 100);
    const totalCents = subtotalCents + taxCents;
    const roomId = res.room ? roomIds[res.room]! : null;
    const resId = generateUlid();
    const confirmNum = `PMS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const guestJson = JSON.stringify({ firstName: guest.first, lastName: guest.last, email: guest.email, phone: guest.phone });

    await db.execute(sql`
      INSERT INTO pms_reservations (id, tenant_id, property_id, guest_id, primary_guest_json, room_type_id, room_id,
        rate_plan_id, check_in_date, check_out_date, status, source_type,
        nightly_rate_cents, subtotal_cents, tax_cents, total_cents, confirmation_number, created_by)
      VALUES (${resId}, ${tenantId}, ${propertyId}, ${guestId}, ${guestJson}::jsonb, ${rtIds[res.rtCode]!}, ${roomId},
        ${ratePlanId}, ${ci}, ${co}, ${res.status}, ${res.source},
        ${nightlyRateCents}, ${subtotalCents}, ${taxCents}, ${totalCents}, ${confirmNum}, ${userId})
    `);

    // Create room block for reservations with assigned rooms
    if (roomId && (res.status === 'CHECKED_IN' || res.status === 'CONFIRMED')) {
      await db.execute(sql`
        INSERT INTO pms_room_blocks (id, tenant_id, property_id, room_id, reservation_id, block_type, start_date, end_date)
        VALUES (${generateUlid()}, ${tenantId}, ${propertyId}, ${roomId}, ${resId}, 'RESERVATION', ${ci}, ${co})
      `);
    }

    // Create folio for non-cancelled, non-hold reservations
    if (res.status !== 'CANCELLED' && res.status !== 'HOLD') {
      const folioId = generateUlid();
      const folioStatus = res.status === 'CHECKED_OUT' ? 'CLOSED' : 'OPEN';
      await db.execute(sql`
        INSERT INTO pms_folios (id, tenant_id, property_id, reservation_id, guest_id, status,
          subtotal_cents, tax_cents, total_cents, balance_cents, created_by)
        VALUES (${folioId}, ${tenantId}, ${propertyId}, ${resId}, ${guestId}, ${folioStatus},
          ${subtotalCents}, ${taxCents}, ${totalCents}, ${totalCents}, ${userId})
      `);

      // Post room charges for checked-in and checked-out reservations
      if (res.status === 'CHECKED_IN' || res.status === 'CHECKED_OUT') {
        const chargeStart = new Date(ci);
        const chargeEnd = res.status === 'CHECKED_OUT' ? new Date(co) : now;
        for (let d = new Date(chargeStart); d < chargeEnd; d.setDate(d.getDate() + 1)) {
          const bd = fmt(d);
          const chargeTax = Math.round(nightlyRateCents * 8.5 / 100);
          await db.execute(sql`
            INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
            VALUES (${generateUlid()}, ${tenantId}, ${folioId}, 'ROOM_CHARGE', ${'Room charge - ' + bd}, ${nightlyRateCents}, ${bd}, ${userId})
          `);
          if (chargeTax > 0) {
            await db.execute(sql`
              INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, posted_by)
              VALUES (${generateUlid()}, ${tenantId}, ${folioId}, 'TAX', ${'Tax - ' + bd}, ${chargeTax}, ${bd}, ${userId})
            `);
          }
        }
      }
    }

    // Set timestamps for checked-in and checked-out reservations
    if (res.status === 'CHECKED_IN') {
      await db.execute(sql`
        UPDATE pms_reservations SET checked_in_at = NOW(), checked_in_by = ${userId} WHERE id = ${resId}
      `);
    }
    if (res.status === 'CHECKED_OUT') {
      await db.execute(sql`
        UPDATE pms_reservations SET checked_in_at = NOW(), checked_in_by = ${userId},
          checked_out_at = NOW(), checked_out_by = ${userId} WHERE id = ${resId}
      `);
    }
    if (res.status === 'CANCELLED') {
      await db.execute(sql`
        UPDATE pms_reservations SET cancelled_at = NOW(), cancelled_by = ${userId}, cancellation_reason = 'Guest request' WHERE id = ${resId}
      `);
    }
  }

  // Create OOO room blocks for rooms 109, 110
  for (const num of ['109', '110']) {
    await db.execute(sql`
      INSERT INTO pms_room_blocks (id, tenant_id, property_id, room_id, block_type, start_date, end_date, reason)
      VALUES (${generateUlid()}, ${tenantId}, ${propertyId}, ${roomIds[num]!}, 'MAINTENANCE', ${startDate}, ${endDate}, 'Renovation')
    `);
  }

  console.log(`[pms-seed] Created Lakeside Lodge & Resort with 30 rooms, 10 guests, ${resDefs.length} reservations`);
}
