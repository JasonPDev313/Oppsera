import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listKdsSends, listKdsSendsSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-order-status — list KDS send tracking records
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const rawParams: Record<string, string> = {};
    url.searchParams.forEach((val, key) => { rawParams[key] = val; });

    const parsed = listKdsSendsSchema.safeParse(rawParams);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listKdsSends({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId!,
      ...parsed.data,
    });

    return NextResponse.json(result);
  },
  { entitlement: 'kds', permission: 'kds.manage' },
);
