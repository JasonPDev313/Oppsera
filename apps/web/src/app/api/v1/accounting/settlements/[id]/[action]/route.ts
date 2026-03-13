import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  matchSettlementTenders,
  matchSettlementTendersSchema,
  postSettlement,
  postSettlementSchema,
  voidSettlement,
  voidSettlementSchema,
} from '@oppsera/module-accounting';
import { postSettlementGl } from '@oppsera/module-payments';
import { db } from '@oppsera/db';
import { paymentSettlements } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

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
        let body: Record<string, unknown> = {};
        try { body = await request.json(); } catch { /* empty body → defaults apply */ }
        const force = body.force === true;

        if (force) {
          // Force-posting unmatched settlements: use accounting module path
          // (supports force=true, runs in publishWithOutbox transaction).
          const parsed = postSettlementSchema.safeParse({
            settlementId,
            force: true,
            clientRequestId: (body.clientRequestId as string) ?? crypto.randomUUID(),
          });
          if (!parsed.success) {
            throw new ValidationError(
              'Validation failed',
              parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
            );
          }
          const result = await postSettlement(ctx, parsed.data);
          return NextResponse.json({ data: result });
        }

        // Normal posting: use the canonical payments module path.
        // This is Vercel-safe (3-phase, no connection held during GL I/O)
        // and calculates from line-level cents instead of header dollars.
        // Read bankAccountId from the settlement record (set during create/import).
        const [settlement] = await db
          .select({ bankAccountId: paymentSettlements.bankAccountId })
          .from(paymentSettlements)
          .where(
            and(
              eq(paymentSettlements.tenantId, ctx.tenantId),
              eq(paymentSettlements.id, settlementId),
            ),
          )
          .limit(1);

        if (!settlement) {
          return NextResponse.json(
            { error: { code: 'NOT_FOUND', message: 'Settlement not found' } },
            { status: 404 },
          );
        }

        if (!settlement.bankAccountId) {
          return NextResponse.json(
            { error: { code: 'MISSING_BANK_ACCOUNT', message: 'Assign a bank account to the settlement before posting' } },
            { status: 422 },
          );
        }

        const result = await postSettlementGl(ctx, {
          settlementId,
          bankAccountId: settlement.bankAccountId,
        });
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

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action` } },
      { status: 404 },
    );
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
