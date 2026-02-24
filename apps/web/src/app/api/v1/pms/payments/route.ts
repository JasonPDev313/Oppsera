import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listPaymentTransactions, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (_req, ctx) => {
    const url = new URL(_req.url);
    const folioId = url.searchParams.get('folioId') ?? undefined;
    const reservationId = url.searchParams.get('reservationId') ?? undefined;
    const data = await listPaymentTransactions(ctx.tenantId, { folioId, reservationId });
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_VIEW },
);
