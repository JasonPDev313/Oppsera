import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getModifierGroupHealth, toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const COLUMNS: CsvColumn[] = [
  { key: 'modifierGroupId', label: 'Group ID' },
  { key: 'groupName', label: 'Group Name' },
  { key: 'isRequired', label: 'Required' },
  { key: 'eligibleLineCount', label: 'Eligible Lines' },
  { key: 'linesWithSelection', label: 'Lines with Selection' },
  { key: 'attachRate', label: 'Attach Rate' },
  { key: 'totalSelections', label: 'Total Selections' },
  { key: 'uniqueModifiers', label: 'Unique Modifiers' },
  { key: 'avgSelectionsPerCheck', label: 'Avg Selections/Check' },
  { key: 'revenueImpactDollars', label: 'Revenue Impact ($)' },
  { key: 'voidCount', label: 'Void Count' },
  { key: 'recommendation', label: 'Recommendation' },
  { key: 'recommendationLabel', label: 'Recommendation Label' },
];

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const rows = await getModifierGroupHealth({
      tenantId: ctx.tenantId,
      dateFrom,
      dateTo,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
    });

    const buffer = toCsv(COLUMNS, rows as unknown as Record<string, unknown>[]);
    const filename = `modifier-group-health_${dateFrom}_${dateTo}.csv`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { entitlement: 'reporting', permission: 'reports.export' },
);
