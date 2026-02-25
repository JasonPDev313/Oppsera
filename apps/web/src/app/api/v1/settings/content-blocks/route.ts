import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateContentBlockSchema } from '@oppsera/shared';
import { getContentBlocks, updateContentBlock } from '@oppsera/core';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const data = await getContentBlocks(ctx.tenantId);
    return NextResponse.json({ data });
  },
  { permission: 'settings.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateContentBlockSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await updateContentBlock(ctx, parsed.data.blockKey, parsed.data.content);
    return NextResponse.json({ data });
  },
  { permission: 'settings.update' },
);
