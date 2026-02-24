import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  savePaymentMethodSchema,
  savePaymentMethod,
  listPaymentMethods,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (_req, ctx) => {
    const url = new URL(_req.url);
    const guestId = url.searchParams.get('guestId');
    if (!guestId) {
      throw new ValidationError('guestId is required', [
        { field: 'guestId', message: 'Required' },
      ]);
    }
    const data = await listPaymentMethods(ctx.tenantId, guestId);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_VIEW },
);

export const POST = withMiddleware(
  async (req, ctx) => {
    const body = await req.json();
    const parsed = savePaymentMethodSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }
    const result = await savePaymentMethod(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_CHARGE, writeAccess: true },
);
