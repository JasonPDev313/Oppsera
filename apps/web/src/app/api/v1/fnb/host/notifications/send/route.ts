import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { sendGuestNotification, sendGuestNotificationSchema } from '@oppsera/module-fnb';

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const parsed = sendGuestNotificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await sendGuestNotification(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.notifications', writeAccess: true },
);
