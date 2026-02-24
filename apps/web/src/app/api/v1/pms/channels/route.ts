import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listChannels,
  createChannel,
  createChannelSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/channels?propertyId=
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');

    if (!propertyId) {
      throw new ValidationError('propertyId is required', [
        { field: 'propertyId', message: 'required' },
      ]);
    }

    const data = await listChannels(ctx.tenantId, propertyId);
    return NextResponse.json({ data: data.items });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_VIEW },
);

// POST /api/v1/pms/channels
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createChannelSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createChannel(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_MANAGE, writeAccess: true },
);
