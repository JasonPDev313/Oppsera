import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  completeWorkOrder,
  completeWorkOrderSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    // segments: [..., 'work-orders', '{id}', 'complete']
    const workOrderId = segments[segments.length - 2]!;

    const body = await request.json();
    const parsed = completeWorkOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }

    const result = await completeWorkOrder(ctx, workOrderId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.MAINTENANCE_MANAGE, writeAccess: true },
);
