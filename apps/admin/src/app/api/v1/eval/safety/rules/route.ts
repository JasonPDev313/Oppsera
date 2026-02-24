import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalSafetyRules } from '@oppsera/db';
import { desc } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── GET: list all safety rules ──────────────────────────────────────────

export const GET = withAdminAuth(async (_req: NextRequest) => {
  const rows = await db
    .select()
    .from(semanticEvalSafetyRules)
    .orderBy(desc(semanticEvalSafetyRules.createdAt));

  return NextResponse.json({ data: rows });
});

// ── POST: create safety rule (admin only) ───────────────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const { name, description, ruleType, severity, config } = body as {
      name: string;
      description?: string;
      ruleType: string;
      severity?: string;
      config: Record<string, unknown>;
    };

    if (!name || !ruleType || !config) {
      return NextResponse.json(
        { error: { message: 'name, ruleType, and config are required' } },
        { status: 400 },
      );
    }

    const id = generateUlid();
    const now = new Date();

    await db.insert(semanticEvalSafetyRules).values({
      id,
      name,
      description: description ?? null,
      ruleType,
      severity: severity ?? 'warning',
      config,
      createdBy: session.adminId,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  'admin',
);
