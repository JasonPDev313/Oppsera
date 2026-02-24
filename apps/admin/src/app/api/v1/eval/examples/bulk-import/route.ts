import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExamples } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── POST: bulk import examples (admin only) ─────────────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const { examples } = body as {
      examples: Array<{
        question: string;
        plan: Record<string, unknown>;
        rationale?: Record<string, unknown>;
        category: string;
        difficulty: string;
        tenantId?: string;
        qualityScore?: string;
      }>;
    };

    if (!examples?.length) {
      return NextResponse.json(
        { error: { message: 'examples array is required and must not be empty' } },
        { status: 400 },
      );
    }

    const now = new Date();
    const ids: string[] = [];

    const values = examples.map((ex) => {
      const id = generateUlid();
      ids.push(id);
      return {
        id,
        tenantId: ex.tenantId ?? null,
        question: ex.question,
        plan: ex.plan,
        rationale: ex.rationale ?? null,
        category: ex.category as never,
        difficulty: ex.difficulty as never,
        qualityScore: ex.qualityScore ?? null,
        isActive: true,
        addedBy: session.adminId,
        createdAt: now,
        updatedAt: now,
      };
    });

    await db.insert(semanticEvalExamples).values(values);

    return NextResponse.json(
      { data: { imported: ids.length, ids } },
      { status: 201 },
    );
  },
  'admin',
);
