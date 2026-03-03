import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { getRevpashMetrics } from '@oppsera/module-fnb';

const querySchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  mealPeriod: z.enum(['breakfast', 'lunch', 'dinner']).optional(),
});

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      date: url.searchParams.get('date') || '',
      mealPeriod: (url.searchParams.get('mealPeriod') as 'breakfast' | 'lunch' | 'dinner' | null) ?? undefined,
    };

    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await getRevpashMetrics(parsed.data);
    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.analytics' },
);
