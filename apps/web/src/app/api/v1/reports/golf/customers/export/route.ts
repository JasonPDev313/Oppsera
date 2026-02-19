import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGolfCustomers } from '@oppsera/module-golf-reporting';
import { toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const COLUMNS: CsvColumn[] = [
  { key: 'customerId', label: 'Customer ID' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'totalRounds', label: 'Total Rounds' },
  { key: 'totalRevenue', label: 'Total Revenue' },
  { key: 'lastPlayedAt', label: 'Last Played' },
  { key: 'avgPartySize', label: 'Avg Party Size' },
];

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const sortBy = (url.searchParams.get('sortBy') as 'totalRounds' | 'totalRevenue' | 'lastPlayedAt') ?? undefined;
    const sortDir = (url.searchParams.get('sortDir') as 'asc' | 'desc') ?? undefined;

    // Fetch all rows (no pagination for export, high limit)
    const result = await getGolfCustomers({
      tenantId: ctx.tenantId,
      limit: 10000,
      sortBy,
      sortDir,
    });

    const buffer = toCsv(COLUMNS, result.items as unknown as Record<string, unknown>[]);
    const filename = `golf-customers.csv`;

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
