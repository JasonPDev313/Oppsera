import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, NotFoundError } from '@oppsera/shared';
import {
  getChannel,
  updateChannel,
  updateChannelSchema,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/channels/[id]
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const data = await getChannel(ctx.tenantId, id);
    if (!data) throw new NotFoundError('Channel', id);

    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_VIEW },
);

// PATCH /api/v1/pms/channels/[id]
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const id = segments[segments.length - 1]!;

    const body = await request.json();
    const parsed = updateChannelSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateChannel(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_MANAGE, writeAccess: true },
);
