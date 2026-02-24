import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalRegressionRuns } from '@oppsera/db';
import { eq, desc } from 'drizzle-orm';

// ── GET: trend data — last 20 completed runs ────────────────────────────

export const GET = withAdminAuth(async (_req: NextRequest) => {
  const rows = await db
    .select({
      id: semanticEvalRegressionRuns.id,
      name: semanticEvalRegressionRuns.name,
      createdAt: semanticEvalRegressionRuns.createdAt,
      passRate: semanticEvalRegressionRuns.passRate,
      totalExamples: semanticEvalRegressionRuns.totalExamples,
      avgLatencyMs: semanticEvalRegressionRuns.avgLatencyMs,
    })
    .from(semanticEvalRegressionRuns)
    .where(eq(semanticEvalRegressionRuns.status, 'completed'))
    .orderBy(desc(semanticEvalRegressionRuns.createdAt))
    .limit(20);

  return NextResponse.json({ data: rows });
});
