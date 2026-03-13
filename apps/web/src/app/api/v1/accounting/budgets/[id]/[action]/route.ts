import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { approveBudget, lockBudget, upsertBudgetLines } from '@oppsera/module-accounting';

const BudgetLineItemSchema = z
  .object({
    glAccountId: z.string(),
    month1: z.number().optional(),
    month2: z.number().optional(),
    month3: z.number().optional(),
    month4: z.number().optional(),
    month5: z.number().optional(),
    month6: z.number().optional(),
    month7: z.number().optional(),
    month8: z.number().optional(),
    month9: z.number().optional(),
    month10: z.number().optional(),
    month11: z.number().optional(),
    month12: z.number().optional(),
    notes: z.string().optional(),
  })
  .strict();

const BudgetLinesSchema = z
  .object({
    lines: z.array(BudgetLineItemSchema).min(1),
  })
  .strict();

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const action = extractAction(request);

    switch (action) {
      case 'approve': {
        const result = await approveBudget(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'lock': {
        const result = await lockBudget(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'lines': {
        const body = await request.json();
        const parsed = BudgetLinesSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
            { status: 400 },
          );
        }
        const result = await upsertBudgetLines(ctx, id, parsed.data.lines);
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
          { status: 404 },
        );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
