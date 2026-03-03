import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getServerLoadSnapshot, getServerLoadQuerySchema } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      locationId: url.searchParams.get('locationId') || ctx.locationId || '',
      businessDate: url.searchParams.get('businessDate') || undefined,
    };

    const parsed = getServerLoadQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await getServerLoadSnapshot({
      tenantId: ctx.tenantId,
      locationId: parsed.data.locationId,
      businessDate: parsed.data.businessDate,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);
