import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getExpoHistory, getExpoViewSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/stations/expo/history — served tickets for today
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const parsed = getExpoViewSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? '',
      businessDate: url.searchParams.get('businessDate') ?? '',
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const view = await getExpoHistory(parsed.data);
    return NextResponse.json({ data: view });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);
