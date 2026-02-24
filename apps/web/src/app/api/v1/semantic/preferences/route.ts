import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticUserPreferences } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const updatePreferencesSchema = z.object({
  preferredMetrics: z.record(z.number()).optional(),
  preferredDimensions: z.record(z.number()).optional(),
  preferredGranularity: z.enum(['day', 'week', 'month', 'quarter', 'year']).nullable().optional(),
  preferredLocationId: z.string().max(128).nullable().optional(),
  defaultDateRange: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'this_quarter', 'this_year']).nullable().optional(),
  frequentQuestions: z.array(z.object({
    question: z.string().max(500),
    count: z.number().int().min(0),
    lastAsked: z.string(),
  })).max(50).optional(),
  topicInterests: z.record(z.number()).optional(),
  lastSessionContext: z.record(z.unknown()).nullable().optional(),
  preferredChartType: z.enum(['line', 'bar', 'table', 'metric', 'pie']).nullable().optional(),
  showDebugPanel: z.boolean().optional(),
  autoExpandTables: z.boolean().optional(),
  insightFeedRole: z.string().max(64).nullable().optional(),
});

// ── GET /api/v1/semantic/preferences ──────────────────────────────
// Get current user's AI preferences. Creates default record if none exists.

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const [row] = await db
      .select()
      .from(semanticUserPreferences)
      .where(
        and(
          eq(semanticUserPreferences.tenantId, ctx.tenantId),
          eq(semanticUserPreferences.userId, ctx.user.id),
        ),
      );

    if (!row) {
      // Return default preferences without persisting (lazy creation on PATCH)
      return NextResponse.json({
        data: {
          preferredMetrics: null,
          preferredDimensions: null,
          preferredGranularity: null,
          preferredLocationId: null,
          defaultDateRange: null,
          frequentQuestions: null,
          topicInterests: null,
          lastSessionContext: null,
          preferredChartType: null,
          showDebugPanel: false,
          autoExpandTables: true,
          insightFeedRole: null,
        },
      });
    }

    return NextResponse.json({
      data: {
        preferredMetrics: row.preferredMetrics ?? null,
        preferredDimensions: row.preferredDimensions ?? null,
        preferredGranularity: row.preferredGranularity ?? null,
        preferredLocationId: row.preferredLocationId ?? null,
        defaultDateRange: row.defaultDateRange ?? null,
        frequentQuestions: row.frequentQuestions ?? null,
        topicInterests: row.topicInterests ?? null,
        lastSessionContext: row.lastSessionContext ?? null,
        preferredChartType: row.preferredChartType ?? null,
        showDebugPanel: row.showDebugPanel ?? false,
        autoExpandTables: row.autoExpandTables ?? true,
        insightFeedRole: row.insightFeedRole ?? null,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── PATCH /api/v1/semantic/preferences ────────────────────────────
// Update current user's AI preferences. Uses upsert (creates if not exists).

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = parsed.data;

    // Check if preferences already exist
    const [existing] = await db
      .select({ id: semanticUserPreferences.id })
      .from(semanticUserPreferences)
      .where(
        and(
          eq(semanticUserPreferences.tenantId, ctx.tenantId),
          eq(semanticUserPreferences.userId, ctx.user.id),
        ),
      );

    let row;

    if (existing) {
      // Update existing preferences
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (data.preferredMetrics !== undefined) updates.preferredMetrics = data.preferredMetrics;
      if (data.preferredDimensions !== undefined) updates.preferredDimensions = data.preferredDimensions;
      if (data.preferredGranularity !== undefined) updates.preferredGranularity = data.preferredGranularity;
      if (data.preferredLocationId !== undefined) updates.preferredLocationId = data.preferredLocationId;
      if (data.defaultDateRange !== undefined) updates.defaultDateRange = data.defaultDateRange;
      if (data.frequentQuestions !== undefined) updates.frequentQuestions = data.frequentQuestions;
      if (data.topicInterests !== undefined) updates.topicInterests = data.topicInterests;
      if (data.lastSessionContext !== undefined) updates.lastSessionContext = data.lastSessionContext;
      if (data.preferredChartType !== undefined) updates.preferredChartType = data.preferredChartType;
      if (data.showDebugPanel !== undefined) updates.showDebugPanel = data.showDebugPanel;
      if (data.autoExpandTables !== undefined) updates.autoExpandTables = data.autoExpandTables;
      if (data.insightFeedRole !== undefined) updates.insightFeedRole = data.insightFeedRole;

      [row] = await db
        .update(semanticUserPreferences)
        .set(updates)
        .where(eq(semanticUserPreferences.id, existing.id))
        .returning();
    } else {
      // Create new preferences record
      [row] = await db
        .insert(semanticUserPreferences)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          preferredMetrics: data.preferredMetrics ?? null,
          preferredDimensions: data.preferredDimensions ?? null,
          preferredGranularity: data.preferredGranularity ?? null,
          preferredLocationId: data.preferredLocationId ?? null,
          defaultDateRange: data.defaultDateRange ?? null,
          frequentQuestions: data.frequentQuestions ?? null,
          topicInterests: data.topicInterests ?? null,
          lastSessionContext: data.lastSessionContext ?? null,
          preferredChartType: data.preferredChartType ?? null,
          showDebugPanel: data.showDebugPanel ?? false,
          autoExpandTables: data.autoExpandTables ?? true,
          insightFeedRole: data.insightFeedRole ?? null,
        })
        .returning();
    }

    return NextResponse.json({
      data: {
        preferredMetrics: row!.preferredMetrics ?? null,
        preferredDimensions: row!.preferredDimensions ?? null,
        preferredGranularity: row!.preferredGranularity ?? null,
        preferredLocationId: row!.preferredLocationId ?? null,
        defaultDateRange: row!.defaultDateRange ?? null,
        frequentQuestions: row!.frequentQuestions ?? null,
        topicInterests: row!.topicInterests ?? null,
        lastSessionContext: row!.lastSessionContext ?? null,
        preferredChartType: row!.preferredChartType ?? null,
        showDebugPanel: row!.showDebugPanel ?? false,
        autoExpandTables: row!.autoExpandTables ?? true,
        insightFeedRole: row!.insightFeedRole ?? null,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
