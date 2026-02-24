import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExamples } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── GET: get single example by id ───────────────────────────────────────

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const [example] = await db
      .select()
      .from(semanticEvalExamples)
      .where(eq(semanticEvalExamples.id, id))
      .limit(1);

    if (!example) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: example });
  },
);

// ── PATCH: update example fields (admin only) ───────────────────────────

export const PATCH = withAdminAuth(
  async (req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const { question, plan, rationale, category, difficulty, qualityScore, isActive } = body as {
      question?: string;
      plan?: Record<string, unknown>;
      rationale?: Record<string, unknown>;
      category?: string;
      difficulty?: string;
      qualityScore?: string;
      isActive?: boolean;
    };

    await db
      .update(semanticEvalExamples)
      .set({
        ...(question !== undefined && { question }),
        ...(plan !== undefined && { plan }),
        ...(rationale !== undefined && { rationale }),
        ...(category !== undefined && { category: category as never }),
        ...(difficulty !== undefined && { difficulty: difficulty as never }),
        ...(qualityScore !== undefined && { qualityScore }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(semanticEvalExamples.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);

// ── DELETE: soft-delete example (admin only) ────────────────────────────

export const DELETE = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    // Soft-delete: set isActive = false
    await db
      .update(semanticEvalExamples)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(semanticEvalExamples.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
