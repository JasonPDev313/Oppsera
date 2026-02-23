import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExamples } from '@oppsera/db';
import { eq } from 'drizzle-orm';

export const PATCH = withAdminAuth(
  async (req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const { category, difficulty, tags, isActive } = body as {
      category?: string;
      difficulty?: string;
      tags?: string[];
      isActive?: boolean;
    };

    await db
      .update(semanticEvalExamples)
      .set({
        ...(category !== undefined && { category: category as never }),
        ...(difficulty !== undefined && { difficulty: difficulty as never }),
        ...(tags !== undefined && { tags }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(semanticEvalExamples.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);

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
