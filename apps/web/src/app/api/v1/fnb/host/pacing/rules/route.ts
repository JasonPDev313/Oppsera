import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listPacingRules,
  upsertPacingRule,
  upsertPacingRuleSchema,
} from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') ?? ctx.locationId ?? '';
    const isActiveParam = url.searchParams.get('isActive');
    const isActive =
      isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

    const rules = await listPacingRules({
      tenantId: ctx.tenantId,
      locationId,
      isActive,
    });

    return NextResponse.json({ data: rules });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const parsed = upsertPacingRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid pacing rule input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await upsertPacingRule(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
