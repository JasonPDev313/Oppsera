import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getBillingCycleRun,
  previewBillingCycle,
  previewBillingCycleSchema,
} from '@oppsera/module-membership';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const run = await getBillingCycleRun({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: run });
  },
  { entitlement: 'club_membership', permission: 'club_membership.billing' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = previewBillingCycleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await previewBillingCycle(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'club_membership', permission: 'club_membership.billing', writeAccess: true },
);
