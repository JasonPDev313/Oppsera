import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { semanticEvalExperiments } from '@oppsera/db';
import { eq } from 'drizzle-orm';

// ── GET: get single experiment by id ────────────────────────────────────

export const GET = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const [experiment] = await db
      .select()
      .from(semanticEvalExperiments)
      .where(eq(semanticEvalExperiments.id, id))
      .limit(1);

    if (!experiment) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: experiment });
  },
);

// ── PATCH: update experiment fields (admin only) ────────────────────────

export const PATCH = withAdminAuth(
  async (req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

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
    } = body as Record<string, unknown>;

    await db
      .update(semanticEvalExperiments)
      .set({
        ...(name !== undefined && { name: name as string }),
        ...(description !== undefined && { description: description as string | null }),
        ...(hypothesis !== undefined && { hypothesis: hypothesis as string | null }),
        ...(controlName !== undefined && { controlName: controlName as string }),
        ...(controlSystemPrompt !== undefined && { controlSystemPrompt: controlSystemPrompt as string | null }),
        ...(controlModel !== undefined && { controlModel: controlModel as string | null }),
        ...(controlTemperature !== undefined && { controlTemperature: controlTemperature as string | null }),
        ...(treatmentName !== undefined && { treatmentName: treatmentName as string }),
        ...(treatmentSystemPrompt !== undefined && { treatmentSystemPrompt: treatmentSystemPrompt as string | null }),
        ...(treatmentModel !== undefined && { treatmentModel: treatmentModel as string | null }),
        ...(treatmentTemperature !== undefined && { treatmentTemperature: treatmentTemperature as string | null }),
        ...(trafficSplitPct !== undefined && { trafficSplitPct: trafficSplitPct as number }),
        ...(targetSampleSize !== undefined && { targetSampleSize: targetSampleSize as number }),
        ...(tenantId !== undefined && { tenantId: tenantId as string | null }),
        updatedAt: new Date(),
      })
      .where(eq(semanticEvalExperiments.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);

// ── DELETE: delete experiment (only if status=draft) ────────────────────

export const DELETE = withAdminAuth(
  async (_req: NextRequest, _session, params) => {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing id' } }, { status: 400 });
    }

    const [experiment] = await db
      .select({ status: semanticEvalExperiments.status })
      .from(semanticEvalExperiments)
      .where(eq(semanticEvalExperiments.id, id))
      .limit(1);

    if (!experiment) {
      return NextResponse.json({ error: { message: 'Not found' } }, { status: 404 });
    }

    if (experiment.status !== 'draft') {
      return NextResponse.json(
        { error: { message: 'Only draft experiments can be deleted' } },
        { status: 409 },
      );
    }

    await db
      .delete(semanticEvalExperiments)
      .where(eq(semanticEvalExperiments.id, id));

    return NextResponse.json({ data: { ok: true } });
  },
  'admin',
);
