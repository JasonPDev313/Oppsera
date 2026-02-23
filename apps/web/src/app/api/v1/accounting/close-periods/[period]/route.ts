import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCloseChecklist, updateClosePeriod } from '@oppsera/module-accounting';

// GET /api/v1/accounting/close-periods/[period] — get close checklist
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    const checklist = await getCloseChecklist({
      tenantId: ctx.tenantId,
      postingPeriod: period,
    });

    return NextResponse.json({ data: checklist });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// PATCH /api/v1/accounting/close-periods/[period] — update close period
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    const body = await request.json();
    const result = await updateClosePeriod(ctx, {
      postingPeriod: period,
      status: body.status,
      checklist: body.checklist,
      notes: body.notes,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
