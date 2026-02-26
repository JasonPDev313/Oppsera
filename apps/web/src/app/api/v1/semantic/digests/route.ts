import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc, lt } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticInsightDigests } from '@oppsera/db';
import { parseLimit } from '@/lib/api-params';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createDigestSchema = z.object({
  digestType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  scheduleDay: z.number().int().min(0).max(6).optional(), // 0=Sunday for weekly digests
  scheduleHour: z.number().int().min(0).max(23).default(8),
  targetRole: z.string().max(64).optional(),
  targetUserId: z.string().max(128).optional(),
  metricSlugs: z.array(z.string().max(128)).max(20).optional(),
  locationId: z.string().max(128).optional(),
  deliveryChannels: z.array(z.enum(['in_app', 'email', 'sms', 'webhook'])).min(1).default(['in_app']),
});

// ── GET /api/v1/semantic/digests ──────────────────────────────────
// List digest configurations for the current tenant.
// Supports: ?activeOnly=true (default), ?digestType=daily, ?limit=50&cursor=xxx

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const digestType = url.searchParams.get('digestType') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [eq(semanticInsightDigests.tenantId, ctx.tenantId)];
    if (activeOnly) {
      conditions.push(eq(semanticInsightDigests.isActive, true));
    }
    if (digestType) {
      conditions.push(eq(semanticInsightDigests.digestType, digestType));
    }
    if (cursor) {
      conditions.push(lt(semanticInsightDigests.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticInsightDigests)
      .where(and(...conditions))
      .orderBy(desc(semanticInsightDigests.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((d) => ({
        id: d.id,
        digestType: d.digestType,
        scheduleDay: d.scheduleDay ?? null,
        scheduleHour: d.scheduleHour,
        targetRole: d.targetRole ?? null,
        targetUserId: d.targetUserId ?? null,
        metricSlugs: d.metricSlugs ?? null,
        locationId: d.locationId ?? null,
        deliveryChannels: d.deliveryChannels,
        isActive: d.isActive,
        lastGeneratedAt: d.lastGeneratedAt ?? null,
        createdBy: d.createdBy ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/digests ─────────────────────────────────
// Create a new digest configuration.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createDigestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;

    // Weekly digests require scheduleDay
    if (input.digestType === 'weekly' && input.scheduleDay === undefined) {
      throw new ValidationError('Validation failed', [
        { field: 'scheduleDay', message: 'scheduleDay is required for weekly digests' },
      ]);
    }

    const [row] = await db
      .insert(semanticInsightDigests)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        digestType: input.digestType,
        scheduleDay: input.scheduleDay ?? null,
        scheduleHour: input.scheduleHour,
        targetRole: input.targetRole ?? null,
        targetUserId: input.targetUserId ?? null,
        metricSlugs: input.metricSlugs ?? null,
        locationId: input.locationId ?? null,
        deliveryChannels: input.deliveryChannels,
        createdBy: ctx.user.id,
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
