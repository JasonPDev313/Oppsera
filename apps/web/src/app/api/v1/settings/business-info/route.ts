import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateBusinessInfoSchema } from '@oppsera/shared';
import { getBusinessInfo, updateBusinessInfo } from '@oppsera/core';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const data = await getBusinessInfo(ctx.tenantId);
    return NextResponse.json({ data });
  },
  { permission: 'settings.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateBusinessInfoSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await updateBusinessInfo(ctx, parsed.data);
    return NextResponse.json({ data });
  },
  { permission: 'settings.update' },
);
