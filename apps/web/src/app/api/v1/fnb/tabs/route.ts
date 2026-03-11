import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { listTabs, openTab, openTabSchema } from '@oppsera/module-fnb';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/fnb/tabs — list tabs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const result = await listTabs({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      businessDate: url.searchParams.get('businessDate') ?? undefined,
      serverUserId: url.searchParams.get('serverUserId') ?? undefined,
      tableId: url.searchParams.get('tableId') ?? undefined,
      status: (url.searchParams.get('status') as 'open' | 'in_progress' | 'ordering' | 'sent_to_kitchen' | 'check_requested' | 'paying' | 'closed' | 'voided' | 'abandoned' | 'transferred' | 'split') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.view' },
);

// POST /api/v1/fnb/tabs — open tab
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    body.serverUserId = body.serverUserId || ctx.user.id;
    const parsed = openTabSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const tab = await openTab(ctx, parsed.data);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: tab }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' , writeAccess: true },
);
