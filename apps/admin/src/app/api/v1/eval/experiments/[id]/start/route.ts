import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExperiments } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── POST: start experiment (draft -> running) ───────────────────────────

export const POST = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const [experiment] = await db
      .select({ status: semanticEvalExperiments.status })
      .from(semanticEvalExperiments)
      .where(eq(semanticEvalExperiments.id, id))
      .limit(1);

    if (!experiment) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    if (experiment.status !== 'draft') {
      return NextResponse.json(
        { error: { message: 'Only draft experiments can be started' } },
        { status: 409 },
      );
    }

    const now = new Date();

    await db
      .update(semanticEvalExperiments)
      .set({
        status: 'running',
        startedAt: now,
        updatedAt: now,
      })
      .where(eq(semanticEvalExperiments.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
