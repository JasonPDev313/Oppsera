import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExperiments } from '@oppsera/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

// ── GET: list experiments with optional status filter + cursor pagination ──

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const limit = Number(searchParams.get('limit') ?? '20');
  const cursor = searchParams.get('cursor');
  const status = searchParams.get('status');

  const conditions = [];
  if (cursor) conditions.push(sql`${semanticEvalExperiments.id} < ${cursor}`);
  if (status) conditions.push(eq(semanticEvalExperiments.status, status));

  const rows = await db
    .select()
    .from(semanticEvalExperiments)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalExperiments.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items,
    meta: {
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    },
  });
});

// ── POST: create experiment (admin only) ────────────────────────────────

export const POST = withAdminAuth(
  async (req: NextRequest, session) => {
    const body = await req.json();
    const {
      name,
      description,
      hypothesis,
      controlName,
      controlSystemPrompt,
      controlModel,
      controlTemperature,
      treatmentName,
      treatmentSystemPrompt,
      treatmentModel,
      treatmentTemperature,
      trafficSplitPct,
      targetSampleSize,
      tenantId,
    } = body as {
      name: string;
      description?: string;
      hypothesis?: string;
      controlName?: string;
      controlSystemPrompt?: string;
      controlModel?: string;
      controlTemperature?: string;
      treatmentName?: string;
      treatmentSystemPrompt?: string;
      treatmentModel?: string;
      treatmentTemperature?: string;
      trafficSplitPct?: number;
      targetSampleSize?: number;
      tenantId?: string;
    };

    if (!name) {
      return NextResponse.json(
        { error: { message: 'name is required' } },
        { status: 400 },
      );
    }

    const id = generateUlid();
    const now = new Date();

    await db.insert(semanticEvalExperiments).values({
      id,
      name,
      description: description ?? null,
      hypothesis: hypothesis ?? null,
      controlName: controlName ?? 'Control',
      controlSystemPrompt: controlSystemPrompt ?? null,
      controlModel: controlModel ?? null,
      controlTemperature: controlTemperature ?? null,
      treatmentName: treatmentName ?? 'Treatment',
      treatmentSystemPrompt: treatmentSystemPrompt ?? null,
      treatmentModel: treatmentModel ?? null,
      treatmentTemperature: treatmentTemperature ?? null,
      trafficSplitPct: trafficSplitPct ?? 50,
      targetSampleSize: targetSampleSize ?? 100,
      tenantId: tenantId ?? null,
      createdBy: session.adminId,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  },
  'admin',
);
