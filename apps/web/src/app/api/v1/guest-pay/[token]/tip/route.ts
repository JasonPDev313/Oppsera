import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { selectGuestPayTip, selectGuestPayTipSchema } from '@oppsera/module-fnb';

// POST /api/v1/guest-pay/:token/tip — guest selects tip
export const POST = withMiddleware(
  async (request: NextRequest) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const token = segments[segments.length - 2]!; // before /tip

    const body = await request.json();
    const parsed = selectGuestPayTipSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await selectGuestPayTip(token, parsed.data);
    if (result.error) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        SESSION_EXPIRED: 410,
        SESSION_NOT_ACTIVE: 409,
        TIP_EXCEEDS_MAX_AMOUNT: 400,
        TIP_EXCEEDS_MAX_PERCENT: 400,
      };
      return NextResponse.json(
        { error: { code: result.error, message: result.error } },
        { status: statusMap[result.error] ?? 400 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { public: true },
);
