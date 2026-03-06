import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listManagerOverrides, listManagerOverridesSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/tabs/manage/audit
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parsed = listManagerOverridesSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      actionType: url.searchParams.get('actionType') ?? undefined,
      dateFrom: url.searchParams.get('startDate') ?? url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('endDate') ?? url.searchParams.get('dateTo') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listManagerOverrides(parsed.data);
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.reports.view' },
);
