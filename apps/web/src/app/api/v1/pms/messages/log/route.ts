import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  logCommunicationSchema,
  logCommunication,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = logCommunicationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })));
    }
    const result = await logCommunication(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.MESSAGES_SEND, writeAccess: true },
);
