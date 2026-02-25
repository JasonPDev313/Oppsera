import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getWaitlist,
  addToWaitlist,
  addToWaitlistSchema,
} from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || ctx.locationId;
    const businessDate =
      url.searchParams.get('businessDate') ||
      new Date().toISOString().slice(0, 10);
    const status = url.searchParams.get('status') || undefined;
    const statusesParam = url.searchParams.get('statuses') || undefined;
    const statuses = statusesParam ? statusesParam.split(',') : undefined;

    const result = await getWaitlist({
      tenantId: ctx.tenantId,
      locationId,
      businessDate,
      status,
      statuses,
    });

    return NextResponse.json({
      data: result.items,
      meta: { totalCount: result.totalCount },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

export const POST = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const body = await req.json();
    const parsed = addToWaitlistSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid waitlist entry',
        parsed.error.issues,
      );
    }

    const result = await addToWaitlist(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
