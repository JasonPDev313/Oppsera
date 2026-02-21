import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getTabDetail, updateTab, updateTabSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/tabs/:id — get tab detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 1]!;

    const tab = await getTabDetail({ tenantId: ctx.tenantId, tabId });
    if (!tab) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tab not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: tab });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.view' },
);

// PATCH /api/v1/fnb/tabs/:id — update tab
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateTabSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const tab = await updateTab(ctx, tabId, parsed.data);
    return NextResponse.json({ data: tab });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' },
);
