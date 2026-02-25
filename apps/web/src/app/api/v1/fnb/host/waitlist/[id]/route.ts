import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateWaitlistEntry,
  updateWaitlistEntrySchema,
  removeFromWaitlist,
} from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const body = await req.json();
    const parsed = updateWaitlistEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid waitlist update',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateWaitlistEntry(ctx, id, parsed.data);

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);

export const DELETE = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    let reason: 'canceled' | 'no_show' = 'canceled';
    try {
      const body = await req.json();
      if (body.reason === 'no_show') reason = 'no_show';
    } catch {
      // No body is fine — defaults to 'canceled'
    }

    await removeFromWaitlist(ctx, id, reason);

    return NextResponse.json({ data: { success: true } });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
