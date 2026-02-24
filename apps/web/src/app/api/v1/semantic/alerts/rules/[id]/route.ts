import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAlertRules } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractRuleId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateAlertRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  ruleType: z.enum(['threshold', 'anomaly', 'trend', 'goal_pace']).optional(),
  metricSlug: z.string().max(128).nullable().optional(),
  thresholdOperator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne']).nullable().optional(),
  thresholdValue: z.string().regex(/^-?\d+(\.\d{1,4})?$/).nullable().optional(),
  sensitivity: z.enum(['low', 'medium', 'high']).optional(),
  baselineWindowDays: z.number().int().min(1).max(365).optional(),
  deliveryChannels: z.array(z.enum(['in_app', 'email', 'sms', 'webhook'])).min(1).optional(),
  schedule: z.enum(['realtime', 'hourly', 'daily', 'weekly']).optional(),
  locationId: z.string().max(128).nullable().optional(),
  dimensionFilters: z.record(z.unknown()).nullable().optional(),
  cooldownMinutes: z.number().int().min(1).max(10080).optional(),
  isActive: z.boolean().optional(),
});

// ── PATCH /api/v1/semantic/alerts/rules/[id] ──────────────────────
// Update an existing alert rule.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractRuleId(request);
    const body = await request.json();
    const parsed = updateAlertRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const data = parsed.data;

    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.ruleType !== undefined) updates.ruleType = data.ruleType;
    if (data.metricSlug !== undefined) updates.metricSlug = data.metricSlug;
    if (data.thresholdOperator !== undefined) updates.thresholdOperator = data.thresholdOperator;
    if (data.thresholdValue !== undefined) updates.thresholdValue = data.thresholdValue;
    if (data.sensitivity !== undefined) updates.sensitivity = data.sensitivity;
    if (data.baselineWindowDays !== undefined) updates.baselineWindowDays = data.baselineWindowDays;
    if (data.deliveryChannels !== undefined) updates.deliveryChannels = data.deliveryChannels;
    if (data.schedule !== undefined) updates.schedule = data.schedule;
    if (data.locationId !== undefined) updates.locationId = data.locationId;
    if (data.dimensionFilters !== undefined) updates.dimensionFilters = data.dimensionFilters;
    if (data.cooldownMinutes !== undefined) updates.cooldownMinutes = data.cooldownMinutes;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    const [row] = await db
      .update(semanticAlertRules)
      .set(updates)
      .where(
        and(
          eq(semanticAlertRules.id, id),
          eq(semanticAlertRules.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Alert rule not found');
    }

    return NextResponse.json({ data: row });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);

// ── DELETE /api/v1/semantic/alerts/rules/[id] ─────────────────────
// Deactivate rule (soft-delete).

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractRuleId(request);

    const [row] = await db
      .update(semanticAlertRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(semanticAlertRules.id, id),
          eq(semanticAlertRules.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Alert rule not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
