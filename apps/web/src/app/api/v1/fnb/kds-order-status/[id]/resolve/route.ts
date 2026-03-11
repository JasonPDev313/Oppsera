import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { resolveKdsSend, resolveKdsSendSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/kds-order-status/[id]/resolve — mark send as resolved
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = resolveKdsSendSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const parts = request.nextUrl.pathname.split('/');
    const sendId = parts[parts.indexOf('kds-order-status') + 1]!;
    await resolveKdsSend(ctx, sendId, parsed.data.reason);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
