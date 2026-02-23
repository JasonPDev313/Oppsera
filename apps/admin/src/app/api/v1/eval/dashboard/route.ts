import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getQualityDashboard } from '@oppsera/module-semantic';

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') || null;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start = searchParams.get('start') ?? thirtyDaysAgo.toISOString();
  const end = searchParams.get('end') ?? now.toISOString();

  const raw = await getQualityDashboard(tenantId, { start, end });

  // Transform to match frontend QualityDashboard type
  const ratingDistribution = Object.entries(raw.ratingDistribution).map(([rating, count]) => ({
    rating: Number(rating),
    count,
  }));

  const hallucinationRate = raw.hallucinationRateTrend.length > 0
    ? raw.hallucinationRateTrend.reduce((sum, d) => sum + d.rate, 0) / raw.hallucinationRateTrend.length
    : 0;

  const clarificationRate = raw.clarificationRateTrend.length > 0
    ? raw.clarificationRateTrend.reduce((sum, d) => sum + d.rate, 0) / raw.clarificationRateTrend.length
    : 0;

  const data = {
    avgUserRating: raw.overallAvgUserRating,
    avgAdminScore: raw.overallAvgAdminScore,
    avgQualityScore: null,
    totalTurns: raw.totalTurns,
    reviewedTurns: raw.reviewedTurns,
    hallucinationRate,
    clarificationRate,
    avgExecutionTimeMs: raw.avgExecutionTimeTrend.length > 0
      ? raw.avgExecutionTimeTrend.reduce((sum, d) => sum + d.avgMs, 0) / raw.avgExecutionTimeTrend.length
      : null,
    ratingDistribution,
    hallucinationTrend: raw.hallucinationRateTrend,
    clarificationTrend: raw.clarificationRateTrend,
    execTimeTrend: raw.avgExecutionTimeTrend,
    byLens: raw.byLens,
  };

  return NextResponse.json({ data });
});
