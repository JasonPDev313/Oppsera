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
  const start = searchParams.get('start');
  const end = searchParams.get('end');

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

  return NextResponse.json({
    data: {
      summary: {
        totalTurns,
        totalTokensInput,
        totalTokensOutput,
        totalCostUsd: totalCostUsd.toFixed(4),
        avgCostPerQuery: totalTurns > 0
          ? (totalCostUsd / totalTurns).toFixed(6)
          : '0.000000',
        days: rows.length,
      },
      dailyData: rows,
    },
  });
});
