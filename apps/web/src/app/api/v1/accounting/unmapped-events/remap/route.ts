import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { batchRemapGlForTenders, batchRemapSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/unmapped-events/remap — execute GL remap for selected tenders
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    const parsed = batchRemapSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    const { tenderIds, reason } = parsed.data;

    const results = await batchRemapGlForTenders(ctx, tenderIds, reason);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      data: {
        results,
        summary: { total: tenderIds.length, success: successCount, failed: failCount },
      },
    });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
