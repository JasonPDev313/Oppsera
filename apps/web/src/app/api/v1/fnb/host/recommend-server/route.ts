import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getServerLoadSnapshot,
  recommendServer,
  recommendServerQuerySchema,
  getSectionTableMap,
} from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      tableId: url.searchParams.get('tableId') || '',
      locationId: url.searchParams.get('locationId') || ctx.locationId || '',
      businessDate: url.searchParams.get('businessDate') || undefined,
    };

    const parsed = recommendServerQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const businessDate = parsed.data.businessDate ?? new Date().toISOString().slice(0, 10);

    // Fetch current server load snapshot and section-table mappings in parallel
    const [serverLoads, sectionAssignments] = await Promise.all([
      getServerLoadSnapshot({
        tenantId: ctx.tenantId,
        locationId: parsed.data.locationId,
        businessDate,
      }),
      getSectionTableMap({
        tenantId: ctx.tenantId,
        locationId: parsed.data.locationId,
        businessDate,
      }),
    ]);

    const recommendation = recommendServer(
      parsed.data.tableId,
      serverLoads,
      sectionAssignments,
      {
        method: 'cover_balance',
        maxCoverDifference: 3,
      },
    );

    return NextResponse.json({ data: recommendation });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage' },
);
