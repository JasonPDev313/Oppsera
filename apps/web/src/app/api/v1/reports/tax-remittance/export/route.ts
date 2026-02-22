import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getTaxRemittanceReport } from '@oppsera/module-accounting';
import { toCsv } from '@oppsera/module-reporting/csv-export';

const CSV_COLUMNS = [
  { key: 'jurisdictionCode', label: 'Jurisdiction Code' },
  { key: 'authorityName', label: 'Authority Name' },
  { key: 'authorityType', label: 'Authority Type' },
  { key: 'taxType', label: 'Tax Type' },
  { key: 'filingFrequency', label: 'Filing Frequency' },
  { key: 'taxRateName', label: 'Tax Rate Name' },
  { key: 'ratePercent', label: 'Rate (%)' },
  { key: 'taxableSales', label: 'Taxable Sales ($)' },
  { key: 'taxCollected', label: 'Tax Collected ($)' },
  { key: 'orderCount', label: 'Order Count' },
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

    const report = await getTaxRemittanceReport({
      tenantId: ctx.tenantId,
      from: dateFrom,
      to: dateTo,
      locationId,
    });

    // Convert cents to dollars for CSV
    const csvRows = report.rows.map((r) => ({
      jurisdictionCode: r.jurisdictionCode ?? '',
      authorityName: r.authorityName ?? '',
      authorityType: r.authorityType ?? '',
      taxType: r.taxType,
      filingFrequency: r.filingFrequency ?? '',
      taxRateName: r.taxRateName,
      ratePercent: (r.rateDecimal * 100).toFixed(4),
      taxableSales: (r.taxableSalesCents / 100).toFixed(2),
      taxCollected: (r.taxCollectedCents / 100).toFixed(2),
      orderCount: r.orderCount,
    }));

    // Add totals row
    csvRows.push({
      jurisdictionCode: '',
      authorityName: '',
      authorityType: '',
      taxType: '',
      filingFrequency: '',
      taxRateName: 'TOTAL',
      ratePercent: '',
      taxableSales: (report.totalTaxableSalesCents / 100).toFixed(2),
      taxCollected: (report.totalTaxCollectedCents / 100).toFixed(2),
      orderCount: '' as unknown as number,
    });

    const buffer = toCsv(CSV_COLUMNS, csvRows as Record<string, unknown>[]);
    const filename = `tax-remittance-${dateFrom}-to-${dateTo}.csv`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
  { entitlement: 'accounting', permission: 'reports.export' },
);
