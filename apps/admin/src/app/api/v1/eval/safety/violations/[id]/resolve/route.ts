import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalSafetyViolations } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── POST: resolve a safety violation ────────────────────────────────────

export const POST = withAdminAuth(
  async (_req: NextRequest, session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const [violation] = await db
      .select({ id: semanticEvalSafetyViolations.id, resolved: semanticEvalSafetyViolations.resolved })
      .from(semanticEvalSafetyViolations)
      .where(eq(semanticEvalSafetyViolations.id, id))
      .limit(1);

    if (!violation) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    if (violation.resolved) {
      return NextResponse.json(
        { error: { message: 'Violation already resolved' } },
        { status: 409 },
      );
    }

    const now = new Date();

    await db
      .update(semanticEvalSafetyViolations)
      .set({
        resolved: true,
        resolvedBy: session.adminId,
        resolvedAt: now,
      })
      .where(eq(semanticEvalSafetyViolations.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
