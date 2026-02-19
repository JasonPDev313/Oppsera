import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getPaceKpis } from '@oppsera/module-golf-reporting';
import { toCsv } from '@oppsera/module-reporting';
import type { CsvColumn } from '@oppsera/module-reporting';

const COLUMNS: CsvColumn[] = [
  { key: 'roundsCompleted', label: 'Rounds Completed' },
  { key: 'avgRoundDurationMin', label: 'Avg Round Duration (min)' },
  { key: 'slowRoundsCount', label: 'Slow Rounds' },
  { key: 'slowRoundPctBps', label: 'Slow Round % (bps)' },
  { key: 'avgMinutesPerHole', label: 'Avg Min/Hole' },
  { key: 'startsCount', label: 'Starts' },
  { key: 'lateStartsCount', label: 'Late Starts' },
  { key: 'avgStartDelayMin', label: 'Avg Start Delay (min)' },
  { key: 'intervalComplianceBps', label: 'Interval Compliance (bps)' },
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

    const kpis = await getPaceKpis({
      tenantId: ctx.tenantId,
      courseId,
      locationId,
      dateFrom,
      dateTo,
    });

    const buffer = toCsv(COLUMNS, [kpis] as unknown as Record<string, unknown>[]);
    const filename = `golf-pace_${dateFrom}_${dateTo}.csv`;

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
