import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { closeAccountingPeriod } from '@oppsera/module-accounting';
import { z } from 'zod';

const closePeriodBodySchema = z.object({
  notes: z.string().max(2000).optional(),
  forceClose: z.boolean().optional(),
}).strict();

// POST /api/v1/accounting/close-periods/[period]/close — close and lock period
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    let body = {};
    try { body = await request.json(); } catch { /* empty body is valid — notes are optional */ }
    const parsed = closePeriodBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }
    const result = await closeAccountingPeriod(ctx, {
      postingPeriod: period,
      notes: parsed.data.notes,
      forceClose: parsed.data.forceClose === true,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true, replayGuard: true, stepUp: 'financial_critical' },
);
