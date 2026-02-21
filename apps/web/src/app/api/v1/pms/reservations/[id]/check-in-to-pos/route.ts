import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError, NotFoundError, ValidationError } from '@oppsera/shared';
import { db, orders, registerTabs } from '@oppsera/db';
import { addLineItem, openOrder } from '@oppsera/module-orders';
import {
  PMS_PERMISSIONS,
  checkIn,
  getFolioByReservation,
  getReservation,
} from '@oppsera/module-pms';

const checkInToPosSchema = z.object({
  terminalId: z.string().min(1),
  catalogItemId: z.string().min(1),
});

function extractReservationId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

function normalizeGuestName(firstName?: string | null, lastName?: string | null): string {
  return [firstName ?? '', lastName ?? ''].join(' ').trim();
}

// POST /api/v1/pms/reservations/:id/check-in-to-pos
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!ctx.locationId) {
      throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
    }

    const reservationId = extractReservationId(request);
    const body = await request.json();
    const parsed = checkInToPosSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const existing = await getReservation(ctx.tenantId, reservationId);
    if (!existing) {
      throw new NotFoundError('Reservation', reservationId);
    }

    if (!['HOLD', 'CONFIRMED', 'CHECKED_IN'].includes(existing.status)) {
      throw new ValidationError('Reservation is not eligible for check-in to POS', [
        {
          field: 'reservationId',
          message: `Cannot check in reservation with status ${existing.status}`,
        },
      ]);
    }

    if (existing.status !== 'CHECKED_IN') {
      if (!existing.roomId) {
        throw new ValidationError('Room must be assigned before check-in', [
          { field: 'roomId', message: 'Room assignment is required' },
        ]);
      }
      await checkIn(ctx, reservationId, {
        roomId: existing.roomId,
        version: existing.version,
      });
    }

    const reservation = await getReservation(ctx.tenantId, reservationId);
    if (!reservation) {
      throw new NotFoundError('Reservation', reservationId);
    }

    const folio = await getFolioByReservation(ctx.tenantId, reservationId);
    const balanceDueCents = Math.max(0, Number(folio?.summary.balanceDue ?? reservation.totalCents));
    const guestName = normalizeGuestName(reservation.guestFirstName, reservation.guestLastName);
    const displayGuestName = guestName || reservation.guestEmail || `Reservation ${reservation.id.slice(-6)}`;

    const order = await openOrder(ctx, {
      source: 'pos',
      terminalId: parsed.data.terminalId,
      employeeId: ctx.user.id,
      customerId: reservation.guestCustomerId ?? undefined,
      notes: `PMS reservation ${reservation.id}`,
    });

    await db
      .update(orders)
      .set({
        metadata: {
          sourceModule: 'pms',
          reservationId: reservation.id,
          folioId: folio?.id ?? null,
          propertyId: reservation.propertyId,
        },
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.tenantId, ctx.tenantId)));

    if (balanceDueCents > 0) {
      await addLineItem(ctx, order.id, {
        catalogItemId: parsed.data.catalogItemId,
        qty: 1,
        priceOverride: {
          unitPrice: balanceDueCents,
          reason: 'custom',
          approvedBy: ctx.user.id,
        },
        notes: `PMS reservation ${reservation.id} balance due`,
      });
    }

    const [tabAgg] = await db
      .select({ maxTab: max(registerTabs.tabNumber) })
      .from(registerTabs)
      .where(
        and(
          eq(registerTabs.tenantId, ctx.tenantId),
          eq(registerTabs.terminalId, parsed.data.terminalId),
        ),
      );

    const nextTabNumber = Number(tabAgg?.maxTab ?? 0) + 1;
    const [tab] = await db
      .insert(registerTabs)
      .values({
        tenantId: ctx.tenantId,
        terminalId: parsed.data.terminalId,
        tabNumber: nextTabNumber,
        orderId: order.id,
        label: displayGuestName.slice(0, 50),
        employeeId: ctx.user.id,
        employeeName: ctx.user.name ?? null,
      })
      .returning();

    return NextResponse.json({
      data: {
        reservationId: reservation.id,
        status: reservation.status,
        orderId: order.id,
        tabId: tab!.id,
        tabNumber: tab!.tabNumber,
        terminalId: parsed.data.terminalId,
        customerId: reservation.guestCustomerId ?? null,
        balanceDueCents,
      },
    });
  },
  { permission: PMS_PERMISSIONS.FRONT_DESK_CHECK_IN, entitlement: 'pms' },
);
