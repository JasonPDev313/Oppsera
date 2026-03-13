import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCloseChecklist, updateClosePeriod } from '@oppsera/module-accounting';

const UpdateClosePeriodSchema = z
  .object({
    status: z.enum(['open', 'in_review', 'closed']).optional(),
    checklist: z.record(z.unknown()).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

// GET /api/v1/accounting/close-periods/[period] — get close checklist
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    const checklist = await getCloseChecklist({
      tenantId: ctx.tenantId,
      postingPeriod: period,
    });

    return NextResponse.json({ data: checklist });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// PATCH /api/v1/accounting/close-periods/[period] — update close period
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    const body = await request.json();
    const parsed = UpdateClosePeriodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }
    const result = await updateClosePeriod(ctx, {
      postingPeriod: period,
      status: parsed.data.status,
      checklist: parsed.data.checklist,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
