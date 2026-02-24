import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getMySection,
  saveMySection,
  saveMySectionSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/my-section?roomId=xxx&businessDate=yyyy-mm-dd
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId');
    const businessDate = url.searchParams.get('businessDate');

    if (!roomId || !businessDate) {
      throw new ValidationError('roomId and businessDate are required', []);
    }

    const result = await getMySection({
      tenantId: ctx.tenantId,
      serverUserId: ctx.user.id,
      roomId,
      businessDate,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

// PUT /api/v1/fnb/my-section — save/update server's table selection
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = saveMySectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await saveMySection(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
