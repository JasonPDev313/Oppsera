import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExamples } from '@oppsera/db';
import { and, eq, isNull } from 'drizzle-orm';

// ── GET: export examples as JSON array ──────────────────────────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const category = searchParams.get('category');
  const difficulty = searchParams.get('difficulty');
  const tenantId = searchParams.get('tenantId');
  const activeOnly = searchParams.get('activeOnly') !== 'false'; // default true

  const conditions = [];
  if (category) conditions.push(eq(semanticEvalExamples.category, category));
  if (difficulty) conditions.push(eq(semanticEvalExamples.difficulty, difficulty));
  if (tenantId) {
    conditions.push(eq(semanticEvalExamples.tenantId, tenantId));
  } else {
    // Default: system-wide examples (tenantId IS NULL)
    conditions.push(isNull(semanticEvalExamples.tenantId));
  }
  if (activeOnly) conditions.push(eq(semanticEvalExamples.isActive, true));

  const rows = await db
    .select()
    .from(semanticEvalExamples)
    .where(conditions.length ? and(...conditions) : undefined);

  return NextResponse.json({ data: rows });
});
