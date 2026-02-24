import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExperiments } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── POST: complete experiment (running -> completed) ────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const body = await req.json();
    const { winner, conclusionNotes } = body as {
      winner: string;
      conclusionNotes?: string;
    };

    if (!winner) {
      return NextResponse.json(
        { error: { message: 'winner is required' } },
        { status: 400 },
      );
    }

    const [experiment] = await db
      .select({ status: semanticEvalExperiments.status })
      .from(semanticEvalExperiments)
      .where(eq(semanticEvalExperiments.id, id))
      .limit(1);

    if (!experiment) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    if (experiment.status !== 'running') {
      return NextResponse.json(
        { error: { message: 'Only running experiments can be completed' } },
        { status: 409 },
      );
    }

    const now = new Date();

    await db
      .update(semanticEvalExperiments)
      .set({
        status: 'completed',
        winner,
        conclusionNotes: conclusionNotes ?? null,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(semanticEvalExperiments.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
