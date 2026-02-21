import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { reopenTab, reopenTabSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/:id/reopen — reopen closed tab
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const tabId = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = reopenTabSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const tab = await reopenTab(ctx, tabId, parsed.data);
    return NextResponse.json({ data: tab });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' },
);
