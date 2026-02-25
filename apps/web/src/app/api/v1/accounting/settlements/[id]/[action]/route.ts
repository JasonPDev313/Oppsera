import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  matchSettlementTenders,
  matchSettlementTendersSchema,
  postSettlement,
  voidSettlement,
  voidSettlementSchema,
} from '@oppsera/module-accounting';

const ACTIONS: Record<string, true> = { match: true, post: true, void: true };

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/accounting/settlements/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const settlementId = extractId(request);

    switch (action) {
      case 'match': {
        const body = await request.json();
        const parsed = matchSettlementTendersSchema.safeParse({
          ...body,
          settlementId,
        });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await matchSettlementTenders(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
      case 'post': {
        let force = false;
        try {
          const body = await request.json();
          force = body.force === true;
        } catch {
          // No body is fine — defaults to force=false
        }
        const result = await postSettlement(ctx, { settlementId, force });
        return NextResponse.json({ data: result });
      }
      case 'void': {
        const body = await request.json();
        const parsed = voidSettlementSchema.safeParse({
          ...body,
          settlementId,
        });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await voidSettlement(ctx, parsed.data);
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
