import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getTabPreauths, getTabPreauthsSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/preauth/[id] — get pre-auths for a tab
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const tabId = parts[parts.length - 1]!;

    const parsed = getTabPreauthsSchema.safeParse({
      tenantId: ctx.tenantId,
      tabId,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await getTabPreauths(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);
