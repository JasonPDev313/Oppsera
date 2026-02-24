import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticMetricGoals } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractGoalId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateGoalSchema = z.object({
  targetValue: z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a numeric string').optional(),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
  periodType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  locationId: z.string().max(128).nullable().optional(),
});

// ── PATCH /api/v1/semantic/goals/[id] ─────────────────────────────
// Update an existing goal (target, notes, isActive, period, etc.)

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractGoalId(request);
    const body = await request.json();
    const parsed = updateGoalSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.targetValue !== undefined) updates.targetValue = parsed.data.targetValue;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.periodType !== undefined) updates.periodType = parsed.data.periodType;
    if (parsed.data.periodStart !== undefined) updates.periodStart = parsed.data.periodStart;
    if (parsed.data.periodEnd !== undefined) updates.periodEnd = parsed.data.periodEnd;
    if (parsed.data.locationId !== undefined) updates.locationId = parsed.data.locationId;

    // Validate date range if both dates are being updated
    if (parsed.data.periodStart && parsed.data.periodEnd && parsed.data.periodEnd <= parsed.data.periodStart) {
      throw new ValidationError('Validation failed', [
        { field: 'periodEnd', message: 'periodEnd must be after periodStart' },
      ]);
    }

    const [row] = await db
      .update(semanticMetricGoals)
      .set(updates)
      .where(
        and(
          eq(semanticMetricGoals.id, id),
          eq(semanticMetricGoals.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Goal not found');
    }

    return NextResponse.json({ data: row });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);

// ── DELETE /api/v1/semantic/goals/[id] ────────────────────────────
// Soft-delete: sets isActive=false

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractGoalId(request);

    const [row] = await db
      .update(semanticMetricGoals)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(semanticMetricGoals.id, id),
          eq(semanticMetricGoals.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Goal not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
