import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getModifierPerformance, toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const COLUMNS: CsvColumn[] = [
  { key: 'modifierId', label: 'Modifier ID' },
  { key: 'modifierName', label: 'Modifier Name' },
  { key: 'modifierGroupId', label: 'Group ID' },
  { key: 'groupName', label: 'Group Name' },
  { key: 'timesSelected', label: 'Times Selected' },
  { key: 'revenueDollars', label: 'Revenue ($)' },
  { key: 'extraRevenueDollars', label: 'Extra Revenue ($)' },
  { key: 'instructionNone', label: 'Instruction: None' },
  { key: 'instructionExtra', label: 'Instruction: Extra' },
  { key: 'instructionOnSide', label: 'Instruction: On Side' },
  { key: 'instructionDefault', label: 'Instruction: Default' },
  { key: 'voidCount', label: 'Void Count' },
  { key: 'voidRevenueDollars', label: 'Void Revenue ($)' },
];

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const rows = await getModifierPerformance({
      tenantId: ctx.tenantId,
      dateFrom,
      dateTo,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
      modifierGroupId: url.searchParams.get('modifierGroupId') ?? undefined,
      catalogItemId: url.searchParams.get('catalogItemId') ?? undefined,
    });

    const buffer = toCsv(COLUMNS, rows as unknown as Record<string, unknown>[]);
    const filename = `modifier-performance_${dateFrom}_${dateTo}.csv`;

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
