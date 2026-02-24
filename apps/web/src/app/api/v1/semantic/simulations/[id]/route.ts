import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticSimulations } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractSimulationId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateSimulationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  isSaved: z.boolean().optional(),
  resultNarrative: z.string().max(10000).nullable().optional(),
  resultSections: z.record(z.unknown()).nullable().optional(),
});

// ── GET /api/v1/semantic/simulations/[id] ─────────────────────────
// Get full simulation detail including all scenarios and results.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractSimulationId(request);

    const [row] = await db
      .select()
      .from(semanticSimulations)
      .where(
        and(
          eq(semanticSimulations.id, id),
          eq(semanticSimulations.tenantId, ctx.tenantId),
        ),
      );

    if (!row) {
      throw new NotFoundError('Simulation not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        simulationType: row.simulationType,
        baseMetricSlug: row.baseMetricSlug,
        baseValue: Number(row.baseValue),
        scenarios: row.scenarios,
        bestScenario: row.bestScenario ?? null,
        resultNarrative: row.resultNarrative ?? null,
        resultSections: row.resultSections ?? null,
        isSaved: row.isSaved,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── PATCH /api/v1/semantic/simulations/[id] ───────────────────────
// Update simulation (save/unsave, update title/description, add narrative).

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractSimulationId(request);
    const body = await request.json();
    const parsed = updateSimulationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.isSaved !== undefined) updates.isSaved = data.isSaved;
    if (data.resultNarrative !== undefined) updates.resultNarrative = data.resultNarrative;
    if (data.resultSections !== undefined) updates.resultSections = data.resultSections;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('Validation failed', [
        { field: 'body', message: 'At least one field is required' },
      ]);
    }

    const [row] = await db
      .update(semanticSimulations)
      .set(updates)
      .where(
        and(
          eq(semanticSimulations.id, id),
          eq(semanticSimulations.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Simulation not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        simulationType: row.simulationType,
        baseMetricSlug: row.baseMetricSlug,
        baseValue: Number(row.baseValue),
        scenarios: row.scenarios,
        bestScenario: row.bestScenario ?? null,
        resultNarrative: row.resultNarrative ?? null,
        resultSections: row.resultSections ?? null,
        isSaved: row.isSaved,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
