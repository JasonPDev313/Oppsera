import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  listFoliosByReservation,
  createAdditionalFolioSchema,
  createAdditionalFolio,
} from '@oppsera/module-pms';

// List all folios for a reservation (multi-folio tabs)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const reservationId = parts[parts.length - 2]!; // /reservations/[id]/folios
    const result = await listFoliosByReservation(ctx.tenantId, reservationId);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.FOLIO_VIEW, entitlement: 'pms' },
);

// Create additional folio (split billing)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const reservationId = parts[parts.length - 2]!; // /reservations/[id]/folios
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = createAdditionalFolioSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await createAdditionalFolio(ctx, reservationId, parsed.data.label);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: PMS_PERMISSIONS.FOLIO_POST_CHARGES, entitlement: 'pms', writeAccess: true },
);
