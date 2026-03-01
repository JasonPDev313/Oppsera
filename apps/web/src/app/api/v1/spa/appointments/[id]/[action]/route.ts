import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  confirmAppointment,
  checkInAppointment,
  startService,
  completeService,
  checkoutAppointment,
  cancelAppointment,
  cancelAppointmentSchema,
  noShowAppointment,
  rescheduleAppointment,
  rescheduleAppointmentSchema,
  addAppointmentService,
  appointmentItemSchema,
  removeAppointmentService,
} from '@oppsera/module-spa';

const ACTIONS: Record<string, true> = {
  confirm: true,
  'check-in': true,
  start: true,
  complete: true,
  checkout: true,
  cancel: true,
  'no-show': true,
  reschedule: true,
  'add-service': true,
  'remove-service': true,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/spa/appointments/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const id = extractId(request);

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine for simple lifecycle transitions
    }

    switch (action) {
      case 'confirm': {
        const result = await confirmAppointment(ctx, {
          id,
          expectedVersion: body.expectedVersion as number | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'check-in': {
        const result = await checkInAppointment(ctx, {
          id,
          expectedVersion: body.expectedVersion as number | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'start': {
        const result = await startService(ctx, {
          id,
          expectedVersion: body.expectedVersion as number | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'complete': {
        const result = await completeService(ctx, {
          id,
          expectedVersion: body.expectedVersion as number | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'checkout': {
        const result = await checkoutAppointment(ctx, {
          id,
          expectedVersion: body.expectedVersion as number | undefined,
          orderId: body.orderId as string | undefined,
          pmsFolioId: body.pmsFolioId as string | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'cancel': {
        const parsed = cancelAppointmentSchema.safeParse({ ...body, id });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await cancelAppointment(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'no-show': {
        const result = await noShowAppointment(ctx, {
          id,
          expectedVersion: body.expectedVersion as number | undefined,
          chargeNoShowFee: body.chargeNoShowFee as boolean | undefined,
          notes: body.notes as string | undefined,
        });
        return NextResponse.json({ data: result });
      }

      case 'reschedule': {
        const parsed = rescheduleAppointmentSchema.safeParse({ ...body, id });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await rescheduleAppointment(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'add-service': {
        const parsedItem = appointmentItemSchema.safeParse(body.item);
        if (!parsedItem.success) {
          throw new ValidationError(
            'Validation failed',
            parsedItem.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await addAppointmentService(ctx, {
          appointmentId: id,
          expectedVersion: body.expectedVersion as number | undefined,
          item: parsedItem.data,
        });
        return NextResponse.json({ data: result });
      }

      case 'remove-service': {
        const itemId = body.itemId as string;
        if (!itemId) {
          throw new ValidationError('Validation failed', [
            { field: 'itemId', message: 'itemId is required' },
          ]);
        }
        const result = await removeAppointmentService(ctx, {
          appointmentId: id,
          itemId,
          expectedVersion: body.expectedVersion as number | undefined,
        });
        return NextResponse.json({ data: result });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action` } },
      { status: 404 },
    );
  },
  { entitlement: 'spa', permission: 'spa.appointments.manage', writeAccess: true },
);
