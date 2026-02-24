import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAlertRules } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createAlertRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  ruleType: z.enum(['threshold', 'anomaly', 'trend', 'goal_pace']).default('threshold'),
  metricSlug: z.string().max(128).optional(),
  thresholdOperator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne']).optional(),
  thresholdValue: z.string().regex(/^-?\d+(\.\d{1,4})?$/).optional(),
  sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
  baselineWindowDays: z.number().int().min(1).max(365).default(30),
  deliveryChannels: z.array(z.enum(['in_app', 'email', 'sms', 'webhook'])).min(1).default(['in_app']),
  schedule: z.enum(['realtime', 'hourly', 'daily', 'weekly']).default('realtime'),
  locationId: z.string().max(128).optional(),
  dimensionFilters: z.record(z.unknown()).optional(),
  originalNlQuery: z.string().max(2000).optional(),
  cooldownMinutes: z.number().int().min(1).max(10080).default(60),
});

// ── GET /api/v1/semantic/alerts/rules ─────────────────────────────
// List alert rules for the current tenant.
// Supports: ?activeOnly=true (default), ?ruleType=threshold, ?limit=50&cursor=xxx

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const ruleType = url.searchParams.get('ruleType') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [eq(semanticAlertRules.tenantId, ctx.tenantId)];
    if (activeOnly) {
      conditions.push(eq(semanticAlertRules.isActive, true));
    }
    if (ruleType) {
      conditions.push(eq(semanticAlertRules.ruleType, ruleType));
    }
    if (cursor) {
      const { lt } = await import('drizzle-orm');
      conditions.push(lt(semanticAlertRules.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticAlertRules)
      .where(and(...conditions))
      .orderBy(desc(semanticAlertRules.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        ruleType: r.ruleType,
        metricSlug: r.metricSlug ?? null,
        thresholdOperator: r.thresholdOperator ?? null,
        thresholdValue: r.thresholdValue ?? null,
        sensitivity: r.sensitivity ?? null,
        baselineWindowDays: r.baselineWindowDays ?? null,
        deliveryChannels: r.deliveryChannels,
        schedule: r.schedule ?? null,
        locationId: r.locationId ?? null,
        dimensionFilters: r.dimensionFilters ?? null,
        originalNlQuery: r.originalNlQuery ?? null,
        isActive: r.isActive,
        lastTriggeredAt: r.lastTriggeredAt ?? null,
        triggerCount: r.triggerCount,
        cooldownMinutes: r.cooldownMinutes,
        createdBy: r.createdBy ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/alerts/rules ────────────────────────────
// Create a new alert rule. Supports NL input via originalNlQuery field.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createAlertRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const input = parsed.data;

    // For threshold rules, require metricSlug and threshold config
    if (input.ruleType === 'threshold') {
      if (!input.metricSlug) {
        throw new ValidationError('Validation failed', [
          { field: 'metricSlug', message: 'metricSlug is required for threshold rules' },
        ]);
      }
      if (!input.thresholdOperator || !input.thresholdValue) {
        throw new ValidationError('Validation failed', [
          { field: 'thresholdOperator', message: 'thresholdOperator and thresholdValue are required for threshold rules' },
        ]);
      }
    }

    const [row] = await db
      .insert(semanticAlertRules)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        ruleType: input.ruleType,
        metricSlug: input.metricSlug ?? null,
        thresholdOperator: input.thresholdOperator ?? null,
        thresholdValue: input.thresholdValue ?? null,
        sensitivity: input.sensitivity,
        baselineWindowDays: input.baselineWindowDays,
        deliveryChannels: input.deliveryChannels,
        schedule: input.schedule,
        locationId: input.locationId ?? null,
        dimensionFilters: input.dimensionFilters ?? null,
        originalNlQuery: input.originalNlQuery ?? null,
        cooldownMinutes: input.cooldownMinutes,
        createdBy: ctx.user.id,
      })
      .returning();

    return NextResponse.json({ data: row }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
