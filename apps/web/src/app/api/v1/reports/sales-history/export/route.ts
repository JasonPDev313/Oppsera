import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSalesHistory, toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const SALES_HISTORY_COLUMNS: CsvColumn[] = [
  { key: 'occurredAt', label: 'Date/Time' },
  { key: 'businessDate', label: 'Business Date' },
  { key: 'effectiveSource', label: 'Revenue Source' },
  { key: 'referenceNumber', label: 'Reference #' },
  { key: 'sourceLabel', label: 'Description' },
  { key: 'customerName', label: 'Customer' },
  { key: 'employeeName', label: 'Employee' },
  { key: 'subtotalDollars', label: 'Subtotal' },
  { key: 'discountDollars', label: 'Discount' },
  { key: 'taxDollars', label: 'Tax' },
  { key: 'serviceChargeDollars', label: 'Svc Charge' },
  { key: 'amountDollars', label: 'Total' },
  { key: 'tipDollars', label: 'Tip' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'status', label: 'Status' },
];

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);

    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const sourcesParam = url.searchParams.get('sources');
    const sources = sourcesParam ? sourcesParam.split(',').filter(Boolean) : undefined;

    const result = await getSalesHistory({
      tenantId: ctx.tenantId,
      locationId,
      sources,
      dateFrom: url.searchParams.get('dateFrom') ?? undefined,
      dateTo: url.searchParams.get('dateTo') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      paymentMethod: url.searchParams.get('paymentMethod') ?? undefined,
      sortBy: url.searchParams.get('sortBy') ?? 'occurred_at',
      sortDir: (url.searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
      limit: 10000,
    });

    const dateFrom = url.searchParams.get('dateFrom') ?? 'all';
    const dateTo = url.searchParams.get('dateTo') ?? 'all';
    const filename = `sales-history_${dateFrom}_${dateTo}.csv`;

    const buffer = toCsv(SALES_HISTORY_COLUMNS, result.items as unknown as Record<string, unknown>[]);

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
