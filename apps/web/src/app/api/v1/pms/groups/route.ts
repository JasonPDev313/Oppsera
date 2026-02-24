import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listGroups,
  createGroup,
  createGroupSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/groups — list groups
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'required' },
      ]);
    }

    const limitParam = url.searchParams.get('limit');

    const result = await listGroups({
      tenantId: ctx.tenantId,
      propertyId,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: limitParam ? Math.min(parseInt(limitParam, 10), 100) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GROUPS_VIEW },
);

// POST /api/v1/pms/groups — create group
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createGroup(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.GROUPS_MANAGE, writeAccess: true },
);
