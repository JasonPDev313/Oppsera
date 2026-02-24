import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticScheduledReports } from '@oppsera/db';
import { ValidationError, NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── Validation ────────────────────────────────────────────────────

const updateScheduledReportSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  deliveryHour: z.number().int().min(0).max(23).optional(),
  deliveryDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  deliveryDayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  recipientType: z.enum(['self', 'role', 'custom']).optional(),
  recipientRoleIds: z.array(z.string()).max(20).nullable().optional(),
  recipientUserIds: z.array(z.string()).max(50).nullable().optional(),
  channel: z.enum(['in_app', 'email', 'webhook']).optional(),
  webhookUrl: z.string().url().max(500).nullable().optional(),
  config: z.object({
    lensSlug: z.string().max(64).optional(),
    metricSlugs: z.array(z.string()).max(20).optional(),
    dimensionSlugs: z.array(z.string()).max(10).optional(),
    filters: z.record(z.unknown()).optional(),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
    format: z.enum(['summary', 'detailed', 'csv']).optional(),
  }).optional(),
  isActive: z.boolean().optional(),
});

// ── PATCH /api/v1/semantic/scheduled-reports/[id] ─────────────────
// Update a scheduled report configuration.
// Only the owning user can update their schedules.

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateScheduledReportSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.frequency !== undefined) updates.frequency = parsed.data.frequency;
    if (parsed.data.deliveryHour !== undefined) updates.deliveryHour = parsed.data.deliveryHour;
    if (parsed.data.deliveryDayOfWeek !== undefined) updates.deliveryDayOfWeek = parsed.data.deliveryDayOfWeek;
    if (parsed.data.deliveryDayOfMonth !== undefined) updates.deliveryDayOfMonth = parsed.data.deliveryDayOfMonth;
    if (parsed.data.recipientType !== undefined) updates.recipientType = parsed.data.recipientType;
    if (parsed.data.recipientRoleIds !== undefined) updates.recipientRoleIds = parsed.data.recipientRoleIds;
    if (parsed.data.recipientUserIds !== undefined) updates.recipientUserIds = parsed.data.recipientUserIds;
    if (parsed.data.channel !== undefined) updates.channel = parsed.data.channel;
    if (parsed.data.webhookUrl !== undefined) updates.webhookUrl = parsed.data.webhookUrl;
    if (parsed.data.config !== undefined) updates.config = parsed.data.config;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    const [row] = await db
      .update(semanticScheduledReports)
      .set(updates)
      .where(
        and(
          eq(semanticScheduledReports.id, id),
          eq(semanticScheduledReports.tenantId, ctx.tenantId),
          eq(semanticScheduledReports.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Scheduled report not found');
    }

    return NextResponse.json({
      data: {
        id: row.id,
        name: row.name,
        reportType: row.reportType,
        frequency: row.frequency,
        deliveryHour: row.deliveryHour,
        deliveryDayOfWeek: row.deliveryDayOfWeek ?? null,
        deliveryDayOfMonth: row.deliveryDayOfMonth ?? null,
        recipientType: row.recipientType,
        recipientRoleIds: row.recipientRoleIds ?? null,
        recipientUserIds: row.recipientUserIds ?? null,
        channel: row.channel,
        webhookUrl: row.webhookUrl ?? null,
        config: row.config ?? {},
        isActive: row.isActive,
        lastDeliveredAt: row.lastDeliveredAt ?? null,
        nextDeliveryAt: row.nextDeliveryAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);

// ── DELETE /api/v1/semantic/scheduled-reports/[id] ────────────────
// Delete a scheduled report configuration. Hard delete since these
// are user-scoped configuration records.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const [row] = await db
      .delete(semanticScheduledReports)
      .where(
        and(
          eq(semanticScheduledReports.id, id),
          eq(semanticScheduledReports.tenantId, ctx.tenantId),
          eq(semanticScheduledReports.userId, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Scheduled report not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
