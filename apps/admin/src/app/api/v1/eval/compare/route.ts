import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getComparativeAnalysis } from '@oppsera/module-semantic';

function computeDateRange(dateRange: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  const days = parseInt(dateRange, 10) || 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

interface BackendItem {
  provider?: string;
  model?: string;
  lensId?: string | null;
  count: number;
  avgRating: number | null;
  avgLatencyMs?: number | null;
  avgTokens?: number | null;
  avgAdminScore?: number | null;
}

function mapToComparativeMetric(item: BackendItem, keyField: keyof BackendItem) {
  return {
    key: String(item[keyField] ?? 'unknown'),
    count: item.count,
    avgRating: item.avgRating,
    avgQuality: item.avgAdminScore ?? null,
    avgLatencyMs: item.avgLatencyMs ?? null,
    errorRate: 0,
  };
}

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;

  // Support simple dateRange param (e.g. '7d', '30d', '90d' or just '30')
  const dateRangeParam = searchParams.get('dateRange');
  // Also support explicit start/end or aStart/aEnd for backward compat
  const explicitStart = searchParams.get('start') ?? searchParams.get('aStart');
  const explicitEnd = searchParams.get('end') ?? searchParams.get('aEnd');

  let dateRange: { start: string; end: string };
  if (explicitStart && explicitEnd) {
    dateRange = { start: explicitStart, end: explicitEnd };
  } else {
    // Strip non-numeric chars (e.g. '30d' -> '30')
    const daysStr = (dateRangeParam ?? '30').replace(/\D/g, '');
    dateRange = computeDateRange(daysStr);
  }

  const raw = await getComparativeAnalysis(tenantId, dateRange);

  const data = {
    byModel: raw.byModel.map((item) => mapToComparativeMetric(item, 'model')),
    byLens: raw.byLens.map((item) => mapToComparativeMetric(item, 'lensId')),
    byProvider: raw.byProvider.map((item) => mapToComparativeMetric(item, 'provider')),
  };

  return NextResponse.json({ data });
});
