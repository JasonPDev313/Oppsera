import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { refreshHostAnalytics } from '@oppsera/module-fnb';

const bodySchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'businessDate must be YYYY-MM-DD'),
  locationId: z.string().min(1),
});

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const parsed = bodySchema.safeParse({
      businessDate: body.businessDate,
      locationId: body.locationId ?? ctx.locationId ?? '',
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await refreshHostAnalytics(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
