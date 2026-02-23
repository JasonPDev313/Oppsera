import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOrdersWriteApi } from '@oppsera/core/helpers/orders-write-api';
import { AppError, NotFoundError, ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  checkIn,
  getFolioByReservation,
  getReservation,
} from '@oppsera/module-pms';
import { createRegisterTabWithAutoNumber } from '@/lib/register-tab-helpers';

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

    // Only call checkIn if not already checked in
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

    // Parallel: re-fetch reservation + folio at the same time
    const [reservation, folio] = await Promise.all([
      getReservation(ctx.tenantId, reservationId),
      getFolioByReservation(ctx.tenantId, reservationId),
    ]);
    if (!reservation) {
      throw new NotFoundError('Reservation', reservationId);
    }

    const balanceDueCents = Math.max(0, Number(folio?.summary.balanceDue ?? reservation.totalCents));
    const guestName = normalizeGuestName(reservation.guestFirstName, reservation.guestLastName);
    const displayGuestName = guestName || reservation.guestEmail || `Reservation ${reservation.id.slice(-6)}`;

    // Metadata passed inline — no separate DB update needed
    const ordersApi = getOrdersWriteApi();
    const order = await ordersApi.openOrder(ctx, {
      source: 'pos',
      terminalId: parsed.data.terminalId,
      employeeId: ctx.user.id,
      customerId: reservation.guestCustomerId ?? undefined,
      notes: `PMS reservation ${reservation.id}`,
      metadata: {
        sourceModule: 'pms',
        reservationId: reservation.id,
        folioId: folio?.id ?? null,
        propertyId: reservation.propertyId,
      },
    });

    // Parallel: add line item + create register tab (tab only needs order.id)
    const [, tab] = await Promise.all([
      balanceDueCents > 0
        ? ordersApi.addLineItem(ctx, order.id, {
            catalogItemId: parsed.data.catalogItemId,
            qty: 1,
            priceOverride: {
              unitPrice: balanceDueCents,
              reason: 'custom',
              approvedBy: ctx.user.id,
            },
            notes: `PMS reservation ${reservation.id} balance due`,
          })
        : Promise.resolve(null),
      createRegisterTabWithAutoNumber(ctx, {
        terminalId: parsed.data.terminalId,
        orderId: order.id,
        label: displayGuestName.slice(0, 50),
      }),
    ]);

    return NextResponse.json({
      data: {
        reservationId: reservation.id,
        status: reservation.status,
        orderId: order.id,
        tabId: tab.id,
        tabNumber: tab.tabNumber,
        terminalId: parsed.data.terminalId,
        customerId: reservation.guestCustomerId ?? null,
        balanceDueCents,
      },
    });
  },
  { permission: PMS_PERMISSIONS.FRONT_DESK_CHECK_IN, entitlement: 'pms' , writeAccess: true },
);
