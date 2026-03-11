import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  PMS_PERMISSIONS,
  createFolioRoutingRuleSchema,
  createFolioRoutingRule,
  listFolioRoutingRules,
} from '@oppsera/module-pms';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    if (!propertyId) {
      throw new ValidationError('propertyId required', [{ field: 'propertyId', message: 'Required' }]);
    }
    const result = await listFolioRoutingRules(ctx.tenantId, propertyId);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.FOLIO_VIEW, entitlement: 'pms' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = createFolioRoutingRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await createFolioRoutingRule(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { permission: PMS_PERMISSIONS.FOLIO_POST_CHARGES, entitlement: 'pms', writeAccess: true },
);
