import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateWaitlistEntry,
  updateWaitlistEntrySchema,
  removeFromWaitlist,
} from '@oppsera/module-fnb';

export const PATCH = withMiddleware(
  async (
    req: NextRequest,
    ctx: any,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateWaitlistEntrySchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid waitlist update',
        parsed.error.issues,
      );
    }

    const result = await updateWaitlistEntry(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);

export const DELETE = withMiddleware(
  async (
    req: NextRequest,
    ctx: any,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    let reason: string | undefined;
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // No body is fine — reason is optional
    }

    await removeFromWaitlist(ctx, { id, reason });

    return NextResponse.json({ data: { success: true } });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
