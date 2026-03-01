import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getOrdersWriteApi } from '@oppsera/core/helpers/orders-write-api';
import { AppError, ValidationError, NotFoundError } from '@oppsera/shared';
import { db, spaAppointments } from '@oppsera/db';
import {
  getAppointment,
  resolveCatalogItemForSpaService,
} from '@oppsera/module-spa';
import { createRegisterTabWithAutoNumber } from '@/lib/register-tab-helpers';

const checkoutToPosSchema = z.object({
  terminalId: z.string().min(1),
});

function extractAppointmentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/spa/appointments/[id]/checkout-to-pos
  return parts[parts.length - 2]!;
}

/**
 * POST /api/v1/spa/appointments/:id/checkout-to-pos
 *
 * Creates a POS order from a completed spa appointment so payment
 * flows through the standard orders/tenders pipeline.
 *
 * Idempotent: if the appointment already has an orderId, returns it.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const appointmentId = extractAppointmentId(request);
    const body = await request.json();
    const parsed = checkoutToPosSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const appointment = await getAppointment({
      tenantId: ctx.tenantId,
      appointmentId,
    });

    if (!appointment) {
      throw new NotFoundError('Appointment', appointmentId);
    }

    // Only completed appointments can be checked out to POS
    if (appointment.status !== 'completed' && appointment.status !== 'checked_out') {
      throw new AppError(
        'INVALID_STATUS',
        `Appointment must be in "completed" status to checkout to POS. Current: "${appointment.status}"`,
        422,
      );
    }

    // Idempotency: if already linked to an order, return it
    if (appointment.orderId) {
      return NextResponse.json({
        data: {
          appointmentId: appointment.id,
          orderId: appointment.orderId,
          alreadyCreated: true,
        },
      });
    }

    if (!appointment.items.length) {
      throw new AppError(
        'NO_ITEMS',
        'Appointment has no service items to check out',
        422,
      );
    }

    // Resolve catalog item IDs for all services (outside transaction for perf)
    const items = appointment.items as Array<{
      serviceId: string;
      serviceName: string;
      finalPriceCents: number;
    }>;
    const catalogItemMap = new Map<string, string>();
    await Promise.all(
      items.map(async (item) => {
        const catalogItemId = await resolveCatalogItemForSpaService(
          ctx.tenantId,
          item.serviceId,
        );
        catalogItemMap.set(item.serviceId, catalogItemId);
      }),
    );

    // Create the order
    const ordersApi = getOrdersWriteApi();
    const order = await ordersApi.openOrder(ctx, {
      source: 'pos',
      terminalId: parsed.data.terminalId,
      employeeId: ctx.user.id,
      customerId: appointment.customerId ?? undefined,
      notes: `Spa appointment ${appointment.appointmentNumber}`,
      metadata: {
        sourceModule: 'spa',
        appointmentId: appointment.id,
        appointmentNumber: appointment.appointmentNumber,
      },
    });

    // Add line items for each service
    await Promise.all(
      items.map((item) => {
        const catalogItemId = catalogItemMap.get(item.serviceId)!;
        return ordersApi.addLineItem(ctx, order.id, {
          catalogItemId,
          qty: 1,
          priceOverride: {
            unitPrice: item.finalPriceCents,
            reason: 'custom',
            approvedBy: ctx.user.id,
          },
          notes: item.serviceName,
        });
      }),
    );

    // Link orderId back to the appointment + create register tab in parallel
    const [, tab] = await Promise.all([
      db
        .update(spaAppointments)
        .set({
          orderId: order.id,
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(spaAppointments.id, appointmentId),
            eq(spaAppointments.tenantId, ctx.tenantId),
          ),
        ),
      createRegisterTabWithAutoNumber(ctx, {
        terminalId: parsed.data.terminalId,
        orderId: order.id,
        label: appointment.guestName?.slice(0, 50) ?? `Spa ${appointment.appointmentNumber}`,
      }),
    ]);

    // Compute total for response
    const totalCents = items.reduce((sum: number, item) => sum + item.finalPriceCents, 0);

    return NextResponse.json({
      data: {
        appointmentId: appointment.id,
        orderId: order.id,
        tabId: tab.id,
        tabNumber: tab.tabNumber,
        terminalId: parsed.data.terminalId,
        customerId: appointment.customerId ?? null,
        totalCents,
        alreadyCreated: false,
      },
    });
  },
  { entitlement: 'spa', permission: 'spa.appointments.manage', writeAccess: true },
);
