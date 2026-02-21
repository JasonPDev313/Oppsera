import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { ensureDefaultProfitCenter } from '@oppsera/core/profit-centers';
import { z } from 'zod';

const bodySchema = z.object({
  locationId: z.string().min(1, 'locationId is required'),
});

// POST /api/v1/profit-centers/ensure-default
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await ensureDefaultProfitCenter(ctx, parsed.data.locationId);
    return NextResponse.json(
      { data: result },
      { status: result.created ? 201 : 200 },
    );
  },
  { entitlement: 'platform_core', permission: 'settings.update' },
);
