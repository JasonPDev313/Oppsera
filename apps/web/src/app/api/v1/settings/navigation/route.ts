import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateNavPreferencesSchema } from '@oppsera/shared';
import { getNavPreferences, saveNavPreferences } from '@oppsera/core';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const itemOrder = await getNavPreferences(ctx.tenantId);
    return NextResponse.json({ data: { itemOrder } });
  },
  { permission: 'settings.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateNavPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const itemOrder = await saveNavPreferences(ctx, parsed.data);
    return NextResponse.json({ data: { itemOrder } });
  },
  { permission: 'settings.update' },
);
