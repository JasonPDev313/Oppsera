import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateCommissionRule,
  deactivateCommissionRule,
  updateCommissionRuleSchema,
} from '@oppsera/module-spa';

function extractId(url: string): string | null {
  return url.split('/rules/')[1]?.split('/')[0]?.split('?')[0] ?? null;
}

// PATCH /api/v1/spa/commissions/rules/[id] — update a commission rule
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing commission rule ID' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateCommissionRuleSchema.safeParse({ ...body, id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const rule = await updateCommissionRule(ctx, parsed.data);
    return NextResponse.json({ data: rule });
  },
  { entitlement: 'spa', permission: 'spa.commissions.manage', writeAccess: true },
);

// DELETE /api/v1/spa/commissions/rules/[id] — deactivate a commission rule
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request.url);
    if (!id) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing commission rule ID' } },
        { status: 400 },
      );
    }

    const result = await deactivateCommissionRule(ctx, { id });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.commissions.manage', writeAccess: true },
);
