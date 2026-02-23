import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { submitAdminReview, adminReviewSchema } from '@oppsera/module-semantic';

export const POST = withAdminAuth(
  async (req: NextRequest, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing turn id' } }, { status: 400 });

    const body = await req.json();
    const parsed = adminReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Validation error', details: parsed.error.errors } },
        { status: 400 },
      );
    }

    await submitAdminReview(id, session.adminId, {
      verdict: parsed.data.verdict,
      score: parsed.data.score,
      notes: parsed.data.notes,
      actionTaken: parsed.data.actionTaken,
    });

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
