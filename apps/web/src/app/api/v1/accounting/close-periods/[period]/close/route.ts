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
    try {
      const result = await closeAccountingPeriod(ctx, {
        postingPeriod: period,
        notes: parsed.data.notes,
        forceClose: parsed.data.forceClose === true,
      });
      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[close-periods/[period]/close] Error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      const name = (err as { constructor?: { name?: string } })?.constructor?.name ?? '';
      const code = (err as { code?: string })?.code;
      if (name === 'PeriodLockedError' || code === 'PERIOD_LOCKED') {
        return NextResponse.json(
          { error: { code: 'PERIOD_LOCKED', message } },
          { status: 409 },
        );
      }
      if (name === 'NotFoundError' || code === 'NOT_FOUND') {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message } },
          { status: 404 },
        );
      }
      const status = (err as { statusCode?: number })?.statusCode ?? 500;
      return NextResponse.json(
        { error: { code: 'CLOSE_PERIOD_FAILED', message } },
        { status },
      );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true, replayGuard: true, stepUp: 'financial_critical' },
);
