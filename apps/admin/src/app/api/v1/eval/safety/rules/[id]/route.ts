import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalSafetyRules } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── GET: get single safety rule ─────────────────────────────────────────

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const [rule] = await db
      .select()
      .from(semanticEvalSafetyRules)
      .where(eq(semanticEvalSafetyRules.id, id))
      .limit(1);

    if (!rule) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: rule });
  },
);

// ── PATCH: update safety rule (admin only) ──────────────────────────────

export const PATCH = withAdminAuth(
  async (req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, ruleType, severity, config, isActive } = body as {
      name?: string;
      description?: string;
      ruleType?: string;
      severity?: string;
      config?: Record<string, unknown>;
      isActive?: boolean;
    };

    await db
      .update(semanticEvalSafetyRules)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(ruleType !== undefined && { ruleType }),
        ...(severity !== undefined && { severity }),
        ...(config !== undefined && { config }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(semanticEvalSafetyRules.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);

// ── DELETE: delete safety rule (admin only) ─────────────────────────────

export const DELETE = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    await db
      .delete(semanticEvalSafetyRules)
      .where(eq(semanticEvalSafetyRules.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
