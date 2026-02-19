import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getGolfRevenue } from '@oppsera/module-golf-reporting';
import { toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const COLUMNS: CsvColumn[] = [
  { key: 'businessDate', label: 'Business Date' },
  { key: 'greenFeeRevenue', label: 'Green Fee Revenue' },
  { key: 'cartFeeRevenue', label: 'Cart Fee Revenue' },
  { key: 'rangeFeeRevenue', label: 'Range Fee Revenue' },
  { key: 'foodBevRevenue', label: 'F&B Revenue' },
  { key: 'proShopRevenue', label: 'Pro Shop Revenue' },
  { key: 'taxTotal', label: 'Tax Total' },
  { key: 'totalRevenue', label: 'Total Revenue' },
  { key: 'roundsPlayed', label: 'Rounds Played' },
  { key: 'revPerRound', label: 'Rev Per Round' },
];

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const courseId = url.searchParams.get('courseId') ?? undefined;
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;

    const rows = await getGolfRevenue({
      tenantId: ctx.tenantId,
      courseId,
      locationId,
      dateFrom,
      dateTo,
    });

    const buffer = toCsv(COLUMNS, rows as unknown as Record<string, unknown>[]);
    const filename = `golf-revenue_${dateFrom}_${dateTo}.csv`;

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
