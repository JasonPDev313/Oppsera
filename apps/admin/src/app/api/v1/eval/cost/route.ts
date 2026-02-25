import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalCostDaily } from '@oppsera/db';
import { and, eq, gte, lte, desc } from 'drizzle-orm';

// ── GET: cost summary with optional tenant and date range filters ───────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId');

  // Support multiple param naming conventions from frontend
  const startParam = searchParams.get('start') ?? searchParams.get('startDate');
  const endParam = searchParams.get('end') ?? searchParams.get('endDate');
  const daysParam = searchParams.get('days');

  // Compute date range from `days` param if explicit start/end not provided
  let start = startParam;
  let end = endParam;
  if (!start && daysParam) {
    const days = parseInt(daysParam, 10) || 30;
    const now = new Date();
    end = now.toISOString().slice(0, 10);
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  const conditions = [];
  if (tenantId) conditions.push(eq(semanticEvalCostDaily.tenantId, tenantId));
  if (start) conditions.push(gte(semanticEvalCostDaily.businessDate, start));
  if (end) conditions.push(lte(semanticEvalCostDaily.businessDate, end));

  const rows = await db
    .select()
    .from(semanticEvalCostDaily)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalCostDaily.businessDate));

  // Compute totals
  let totalTurns = 0;
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let totalCostUsd = 0;

  for (const row of rows) {
    totalTurns += row.totalTurns;
    totalTokensInput += row.totalTokensInput;
    totalTokensOutput += row.totalTokensOutput;
    totalCostUsd += Number(row.totalCostUsd);
  }

  // Map daily data to match CostDaily frontend type
  const dailyData = rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    businessDate: row.businessDate,
    totalTurns: row.totalTurns,
    totalTokensInput: row.totalTokensInput,
    totalTokensOutput: row.totalTokensOutput,
    totalCostUsd: Number(row.totalCostUsd),
    avgCostPerQuery: row.totalTurns > 0 ? Number(row.totalCostUsd) / row.totalTurns : null,
    modelBreakdown: row.modelBreakdown as Record<string, unknown> | null,
    lensBreakdown: row.lensBreakdown as Record<string, unknown> | null,
    createdAt: row.createdAt,
  }));

  // Flatten response to match CostSummary frontend type
  return NextResponse.json({
    data: {
      totalTurns,
      totalTokensInput,
      totalTokensOutput,
      totalCostUsd,
      avgCostPerQuery: totalTurns > 0 ? totalCostUsd / totalTurns : 0,
      dailyData,
    },
  });
});
