import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listWorkOrders,
  createWorkOrder,
  createWorkOrderSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [{ field: 'propertyId', message: 'required' }]);
    }

    const limitParam = url.searchParams.get('limit');

    const result = await listWorkOrders(ctx.tenantId, propertyId, {
      status: url.searchParams.get('status') ?? undefined,
      roomId: url.searchParams.get('roomId') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
      priority: url.searchParams.get('priority') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.MAINTENANCE_VIEW },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createWorkOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }
    const result = await createWorkOrder(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.MAINTENANCE_MANAGE, writeAccess: true },
);
