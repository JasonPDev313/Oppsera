import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  upsertPacingRule,
  upsertPacingRuleSchema,
  deletePacingRule,
} from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const body = await req.json();
    const parsed = upsertPacingRuleSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid pacing rule update',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await upsertPacingRule(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);

export const DELETE = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const url = new URL(req.url);
    const clientRequestId = url.searchParams.get('clientRequestId') ?? undefined;

    const result = await deletePacingRule(ctx, { id, clientRequestId });

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
