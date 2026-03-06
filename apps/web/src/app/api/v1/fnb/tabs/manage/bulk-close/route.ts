import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { bulkCloseTabs, bulkCloseTabsSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/manage/bulk-close
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bulkCloseTabsSchema.safeParse({
      ...body,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? body.locationId,
      approverUserId: body.approverUserId || ctx.user.id,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await bulkCloseTabs(ctx, parsed.data);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
