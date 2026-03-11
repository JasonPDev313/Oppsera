import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  updateFolioRoutingRuleSchema,
  updateFolioRoutingRule,
  deleteFolioRoutingRule,
} from '@oppsera/module-pms';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const ruleId = parts[parts.length - 1]!;
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = updateFolioRoutingRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await updateFolioRoutingRule(ctx, ruleId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.FOLIO_POST_CHARGES, entitlement: 'pms', writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const ruleId = parts[parts.length - 1]!;
    const result = await deleteFolioRoutingRule(ctx, ruleId);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.FOLIO_POST_CHARGES, entitlement: 'pms', writeAccess: true },
);
