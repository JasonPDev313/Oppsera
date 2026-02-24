import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalTurns, semanticEvalExamples } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── POST: promote admin-corrected plan to a golden example ──────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing turn id' } }, { status: 400 });
    }

    const body = await req.json();
    const { category, difficulty } = body as {
      category: string;
      difficulty: string;
    };

    if (!category || !difficulty) {
      return NextResponse.json(
        { error: { message: 'category and difficulty are required' } },
        { status: 400 },
      );
    }

    // Fetch the turn and verify corrected plan exists
    const [turn] = await db
      .select({
        id: semanticEvalTurns.id,
        tenantId: semanticEvalTurns.tenantId,
        userMessage: semanticEvalTurns.userMessage,
        adminCorrectedPlan: semanticEvalTurns.adminCorrectedPlan,
        llmRationale: semanticEvalTurns.llmRationale,
        adminActionTaken: semanticEvalTurns.adminActionTaken,
      })
      .from(semanticEvalTurns)
      .where(eq(semanticEvalTurns.id, id))
      .limit(1);

    if (!turn) {
      return NextResponse.json({ error: { message: 'Turn not found' } }, { status: 404 });
    }

    if (!turn.adminCorrectedPlan) {
      return NextResponse.json(
        { error: { message: 'Turn has no admin-corrected plan to promote' } },
        { status: 400 },
      );
    }

    // Create a new golden example using the corrected plan
    const exampleId = generateUlid();
    const now = new Date();

    await db.insert(semanticEvalExamples).values({
      id: exampleId,
      tenantId: turn.tenantId,
      sourceEvalTurnId: turn.id,
      question: turn.userMessage,
      plan: turn.adminCorrectedPlan, // Use the corrected plan, not the original llmPlan
      rationale: turn.llmRationale,
      category: category as never,
      difficulty: difficulty as never,
      isActive: true,
      addedBy: session.adminId,
      createdAt: now,
      updatedAt: now,
    });

    // Update the turn's adminActionTaken
    await db
      .update(semanticEvalTurns)
      .set({
        adminActionTaken: 'added_to_examples',
        updatedAt: now,
      })
      .where(eq(semanticEvalTurns.id, id));

    return NextResponse.json({ data: { id: exampleId } }, { status: 201 });
  },
  'admin',
);
