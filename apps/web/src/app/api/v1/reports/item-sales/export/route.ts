import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getItemSales, toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const ITEM_SALES_COLUMNS: CsvColumn[] = [
  { key: 'catalogItemId', label: 'Item ID' },
  { key: 'catalogItemName', label: 'Item Name' },
  { key: 'quantitySold', label: 'Quantity Sold' },
  { key: 'grossRevenue', label: 'Gross Revenue' },
  { key: 'quantityVoided', label: 'Quantity Voided' },
  { key: 'voidRevenue', label: 'Void Revenue' },
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
    const sortBy = (url.searchParams.get('sortBy') as 'quantitySold' | 'grossRevenue') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const rows = await getItemSales({
      tenantId: ctx.tenantId,
      locationId,
      dateFrom,
      dateTo,
      sortBy,
      limit,
    });

    const buffer = toCsv(ITEM_SALES_COLUMNS, rows as unknown as Record<string, unknown>[]);
    const filename = `item-sales_${dateFrom}_${dateTo}.csv`;

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
