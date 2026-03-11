import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listItemPrepTimes,
  upsertItemPrepTime,
  upsertItemPrepTimeSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/item-prep-times — list item prep times
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const items = await listItemPrepTimes({
      tenantId: ctx.tenantId,
      catalogItemId: url.searchParams.get('catalogItemId') ?? undefined,
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      stationId: url.searchParams.get('stationId') ?? undefined,
    });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/kds-settings/item-prep-times — upsert item prep time
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = upsertItemPrepTimeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const item = await upsertItemPrepTime(ctx, parsed.data);
    return NextResponse.json({ data: item }, { status: 201 });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);
