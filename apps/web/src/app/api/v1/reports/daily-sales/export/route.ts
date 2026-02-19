import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getDailySales, toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const DAILY_SALES_COLUMNS: CsvColumn[] = [
  { key: 'businessDate', label: 'Business Date' },
  { key: 'locationId', label: 'Location ID' },
  { key: 'orderCount', label: 'Order Count' },
  { key: 'grossSales', label: 'Gross Sales' },
  { key: 'discountTotal', label: 'Discount Total' },
  { key: 'taxTotal', label: 'Tax Total' },
  { key: 'netSales', label: 'Net Sales' },
  { key: 'tenderCash', label: 'Cash' },
  { key: 'tenderCard', label: 'Card' },
  { key: 'voidCount', label: 'Void Count' },
  { key: 'voidTotal', label: 'Void Total' },
  { key: 'avgOrderValue', label: 'Avg Order Value' },
];

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    if (!dateFrom || !dateTo) {
      throw new AppError('VALIDATION_ERROR', 'dateFrom and dateTo are required', 400);
    }

    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;

    const rows = await getDailySales({
      tenantId: ctx.tenantId,
      locationId,
      dateFrom,
      dateTo,
    });

    const buffer = toCsv(DAILY_SALES_COLUMNS, rows as unknown as Record<string, unknown>[]);
    const filename = `daily-sales_${dateFrom}_${dateTo}.csv`;

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
