import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalRegressionRuns,
  semanticEvalRegressionResults,
} from '@oppsera/db';
import { eq, asc } from 'drizzle-orm';

// ── GET: get regression run detail with all results ─────────────────────

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    // Fetch the run
    const [run] = await db
      .select()
      .from(semanticEvalRegressionRuns)
      .where(eq(semanticEvalRegressionRuns.id, id))
      .limit(1);

    if (!run) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    // Fetch all results for this run
    const results = await db
      .select()
      .from(semanticEvalRegressionResults)
      .where(eq(semanticEvalRegressionResults.runId, id))
      .orderBy(asc(semanticEvalRegressionResults.createdAt));

    return NextResponse.json({
      data: {
        ...run,
        results,
      },
    });
  },
);
