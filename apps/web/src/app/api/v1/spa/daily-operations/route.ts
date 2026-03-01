import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import {
  getDailyOperations,
  openDailyOperations,
  updateChecklistItem,
  addIncident,
  closeDailyOperations,
  addDailyNotes,
} from '@oppsera/module-spa';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId');
    const businessDate = url.searchParams.get('businessDate');
    if (!locationId || !businessDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'locationId and businessDate are required' } },
        { status: 400 },
      );
    }
    const result = await getDailyOperations({ tenantId: ctx.tenantId, locationId, businessDate });
    if (!result) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No record for this date' } }, { status: 404 });
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.view' },
);

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const result = await openDailyOperations(ctx, body);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.manage', writeAccess: true },
);

export const PATCH = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const { dailyOpsId, action, ...rest } = body;
    if (!dailyOpsId || !action) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'dailyOpsId and action are required' } },
        { status: 400 },
      );
    }

    switch (action) {
      case 'updateChecklist':
        await updateChecklistItem(ctx, { dailyOpsId, ...rest });
        break;
      case 'addIncident':
        await addIncident(ctx, { dailyOpsId, ...rest });
        break;
      case 'addNotes':
        await addDailyNotes(ctx, { dailyOpsId, ...rest });
        break;
      case 'close':
        await closeDailyOperations(ctx, { dailyOpsId, ...rest });
        break;
      default:
        return NextResponse.json(
          { error: { code: 'INVALID_ACTION', message: `Unknown action: ${action}` } },
          { status: 400 },
        );
    }
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'spa', permission: 'spa.manage', writeAccess: true },
);
