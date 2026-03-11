import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  emailFolioSchema,
  emailFolio,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const folioId = parts[parts.length - 2]!; // /folios/[id]/email
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = emailFolioSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await emailFolio(ctx, folioId, parsed.data.recipientEmail);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.FOLIO_POST_CHARGES, entitlement: 'pms', writeAccess: true },
);
