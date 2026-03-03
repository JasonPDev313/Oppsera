import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { getHostAnalyticsDashboard } from '@oppsera/module-fnb';

const querySchema = z.object({
  locationId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
  mealPeriod: z.enum(['breakfast', 'lunch', 'dinner', 'other', 'all']).optional(),
}).refine(
  (d) => d.startDate <= d.endDate,
  { message: 'startDate must be on or before endDate', path: ['startDate'] },
);

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      startDate: url.searchParams.get('startDate') || '',
      endDate: url.searchParams.get('endDate') || '',
      mealPeriod: url.searchParams.get('mealPeriod') ?? undefined,
    };

    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await getHostAnalyticsDashboard({
      tenantId: ctx.tenantId,
      ...parsed.data,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
