import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticInsightDigests } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractDigestId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateDigestSchema = z.object({
  digestType: z.enum(['daily', 'weekly', 'monthly']).optional(),
  scheduleDay: z.number().int().min(0).max(6).nullable().optional(),
  scheduleHour: z.number().int().min(0).max(23).optional(),
  targetRole: z.string().max(64).nullable().optional(),
  targetUserId: z.string().max(128).nullable().optional(),
  metricSlugs: z.array(z.string().max(128)).max(20).nullable().optional(),
  locationId: z.string().max(128).nullable().optional(),
  deliveryChannels: z.array(z.enum(['in_app', 'email', 'sms', 'webhook'])).min(1).optional(),
  isActive: z.boolean().optional(),
});

// ── GET /api/v1/semantic/digests/[id] ─────────────────────────────
// Get digest detail with last generated content.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractDigestId(request);

    const [row] = await db
      .select()
      .from(semanticInsightDigests)
      .where(
        and(
          eq(semanticInsightDigests.id, id),
          eq(semanticInsightDigests.tenantId, ctx.tenantId),
        ),
      );

    if (!row) {
      throw new NotFoundError('Digest not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        digestType: row.digestType,
        scheduleDay: row.scheduleDay ?? null,
        scheduleHour: row.scheduleHour,
        targetRole: row.targetRole ?? null,
        targetUserId: row.targetUserId ?? null,
        metricSlugs: row.metricSlugs ?? null,
        locationId: row.locationId ?? null,
        deliveryChannels: row.deliveryChannels,
        isActive: row.isActive,
        lastGeneratedAt: row.lastGeneratedAt ?? null,
        lastNarrative: row.lastNarrative ?? null,
        lastSections: row.lastSections ?? null,
        lastKpis: row.lastKpis ?? null,
        createdBy: row.createdBy ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── PATCH /api/v1/semantic/digests/[id] ───────────────────────────
// Update digest configuration.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractDigestId(request);
    const body = await request.json();
    const parsed = updateDigestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = parsed.data;
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (data.digestType !== undefined) updates.digestType = data.digestType;
    if (data.scheduleDay !== undefined) updates.scheduleDay = data.scheduleDay;
    if (data.scheduleHour !== undefined) updates.scheduleHour = data.scheduleHour;
    if (data.targetRole !== undefined) updates.targetRole = data.targetRole;
    if (data.targetUserId !== undefined) updates.targetUserId = data.targetUserId;
    if (data.metricSlugs !== undefined) updates.metricSlugs = data.metricSlugs;
    if (data.locationId !== undefined) updates.locationId = data.locationId;
    if (data.deliveryChannels !== undefined) updates.deliveryChannels = data.deliveryChannels;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [row] = await db
      .update(semanticInsightDigests)
      .set(updates)
      .where(
        and(
          eq(semanticInsightDigests.id, id),
          eq(semanticInsightDigests.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Digest not found');
    }

    return NextResponse.json({ data: row });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);

// ── DELETE /api/v1/semantic/digests/[id] ──────────────────────────
// Deactivate digest (soft-delete).

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractDigestId(request);

    const [row] = await db
      .update(semanticInsightDigests)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(semanticInsightDigests.id, id),
          eq(semanticInsightDigests.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Digest not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
