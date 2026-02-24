import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalReviewAssignments } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── PATCH: update assignment status ─────────────────────────────────────

export const PATCH = withAdminAuth(
  async (req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body as { status: string };

    if (!status) {
      return NextResponse.json(
        { error: { message: 'status is required' } },
        { status: 400 },
      );
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'skipped'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: { message: `status must be one of: ${validStatuses.join(', ')}` } },
        { status: 400 },
      );
    }

    const updateFields: Record<string, unknown> = { status };
    if (status === 'completed') {
      updateFields.completedAt = new Date();
    }

    await db
      .update(semanticEvalReviewAssignments)
      .set(updateFields)
      .where(eq(semanticEvalReviewAssignments.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
