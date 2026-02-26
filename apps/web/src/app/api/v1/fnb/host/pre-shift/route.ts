import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { hostGetPreShiftReport, hostGetPreShiftReportSchema } from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      date: url.searchParams.get('date') || new Date().toISOString().slice(0, 10),
      mealPeriod: url.searchParams.get('mealPeriod') || '',
    };
    const parsed = hostGetPreShiftReportSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await hostGetPreShiftReport(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
