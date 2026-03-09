import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  ackKdsSendDelivery,
  ackKdsSendDisplay,
  ackKdsSendInteraction,
  ackKdsSendSchema,
} from '@oppsera/module-fnb';

// POST /api/v1/fnb/kds-order-status/ack — KDS client acknowledges delivery/display/interaction
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = ackKdsSendSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { sendToken, ackType, actorId, actorName } = parsed.data;
    let result: { success: boolean };

    switch (ackType) {
      case 'delivery':
        result = await ackKdsSendDelivery(ctx.tenantId, ctx.locationId!, sendToken);
        break;
      case 'display':
        result = await ackKdsSendDisplay(ctx.tenantId, ctx.locationId!, sendToken);
        break;
      case 'interaction':
        result = await ackKdsSendInteraction(ctx.tenantId, ctx.locationId!, sendToken, actorId, actorName);
        break;
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'kds', permission: 'kds.view', writeAccess: true },
);
