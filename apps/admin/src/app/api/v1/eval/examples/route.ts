import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { getGoldenExamples } from '@oppsera/module-semantic';
import { db } from '@oppsera/db';
import { semanticEvalExamples } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── GET: list golden examples ───────────────────────────────────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const tenantId = searchParams.get('tenantId') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const difficulty = searchParams.get('difficulty') ?? undefined;

  const examples = await getGoldenExamples(
    tenantId,
    category as Parameters<typeof getGoldenExamples>[1],
    difficulty as Parameters<typeof getGoldenExamples>[2],
  );

  return NextResponse.json({ data: examples });
});

// ── POST: create a new golden example (admin only) ──────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const {
      question,
      plan,
      rationale,
      category,
      difficulty,
      tenantId,
    } = body as {
      question: string;
      plan: Record<string, unknown>;
      rationale?: Record<string, unknown>;
      category: string;
      difficulty: string;
      tenantId?: string;
    };

    if (!question || !plan || !category || !difficulty) {
      return NextResponse.json(
        { error: { message: 'question, plan, category, and difficulty are required' } },
        { status: 400 },
      );
    }

    const id = generateUlid();
    const now = new Date();

    await db.insert(semanticEvalExamples).values({
      id,
      tenantId: tenantId ?? null,
      question,
      plan,
      rationale: rationale ?? null,
      category: category as never,
      difficulty: difficulty as never,
      isActive: true,
      addedBy: session.adminId,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  'admin',
);
