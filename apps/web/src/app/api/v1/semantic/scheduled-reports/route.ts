import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticScheduledReports } from '@oppsera/db';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createScheduledReportSchema = z.object({
  name: z.string().min(1).max(200),
  reportType: z.enum(['digest', 'custom_report', 'metric_snapshot']).default('digest'),
  frequency: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  deliveryHour: z.number().int().min(0).max(23).default(8),
  deliveryDayOfWeek: z.number().int().min(0).max(6).optional(),
  deliveryDayOfMonth: z.number().int().min(1).max(28).optional(),
  recipientType: z.enum(['self', 'role', 'custom']).default('self'),
  recipientRoleIds: z.array(z.string()).max(20).optional(),
  recipientUserIds: z.array(z.string()).max(50).optional(),
  channel: z.enum(['in_app', 'email', 'webhook']).default('in_app'),
  webhookUrl: z.string().url().max(500).optional(),
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
});

// ── GET /api/v1/semantic/scheduled-reports ─────────────────────────
// List the current user's scheduled report configurations.
// Supports:
//   ?activeOnly=true (default: true) — show only active schedules
//   ?limit=50&cursor=xxx — cursor pagination

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [
      eq(semanticScheduledReports.tenantId, ctx.tenantId),
      eq(semanticScheduledReports.userId, ctx.user.id),
    ];
    if (activeOnly) {
      conditions.push(eq(semanticScheduledReports.isActive, true));
    }
    if (cursor) {
      const { lt } = await import('drizzle-orm');
      conditions.push(lt(semanticScheduledReports.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticScheduledReports)
      .where(and(...conditions))
      .orderBy(desc(semanticScheduledReports.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((s) => ({
        id: s.id,
        name: s.name,
        reportType: s.reportType,
        frequency: s.frequency,
        deliveryHour: s.deliveryHour,
        deliveryDayOfWeek: s.deliveryDayOfWeek ?? null,
        deliveryDayOfMonth: s.deliveryDayOfMonth ?? null,
        recipientType: s.recipientType,
        recipientRoleIds: s.recipientRoleIds ?? null,
        recipientUserIds: s.recipientUserIds ?? null,
        channel: s.channel,
        webhookUrl: s.webhookUrl ?? null,
        config: s.config ?? {},
        isActive: s.isActive,
        lastDeliveredAt: s.lastDeliveredAt ?? null,
        nextDeliveryAt: s.nextDeliveryAt ?? null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/scheduled-reports ────────────────────────
// Create a new scheduled report configuration.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createScheduledReportSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = parsed.data;

    // Validate webhook URL is required when channel is 'webhook'
    if (data.channel === 'webhook' && !data.webhookUrl) {
      throw new ValidationError('Validation failed', [
        { field: 'webhookUrl', message: 'webhookUrl is required when channel is webhook' },
      ]);
    }

    // Validate day-of-week is required for weekly frequency
    if (data.frequency === 'weekly' && data.deliveryDayOfWeek === undefined) {
      throw new ValidationError('Validation failed', [
        { field: 'deliveryDayOfWeek', message: 'deliveryDayOfWeek is required for weekly frequency' },
      ]);
    }

    // Validate day-of-month is required for monthly frequency
    if (data.frequency === 'monthly' && data.deliveryDayOfMonth === undefined) {
      throw new ValidationError('Validation failed', [
        { field: 'deliveryDayOfMonth', message: 'deliveryDayOfMonth is required for monthly frequency' },
      ]);
    }

    // Compute initial nextDeliveryAt
    const nextDeliveryAt = computeNextDelivery(
      data.frequency,
      data.deliveryHour,
      data.deliveryDayOfWeek,
      data.deliveryDayOfMonth,
    );

    const [row] = await db
      .insert(semanticScheduledReports)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        name: data.name,
        reportType: data.reportType,
        frequency: data.frequency,
        deliveryHour: data.deliveryHour,
        deliveryDayOfWeek: data.deliveryDayOfWeek ?? null,
        deliveryDayOfMonth: data.deliveryDayOfMonth ?? null,
        recipientType: data.recipientType,
        recipientRoleIds: data.recipientRoleIds ?? null,
        recipientUserIds: data.recipientUserIds ?? null,
        channel: data.channel,
        webhookUrl: data.webhookUrl ?? null,
        config: data.config ?? {},
        nextDeliveryAt,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        name: row!.name,
        reportType: row!.reportType,
        frequency: row!.frequency,
        deliveryHour: row!.deliveryHour,
        deliveryDayOfWeek: row!.deliveryDayOfWeek ?? null,
        deliveryDayOfMonth: row!.deliveryDayOfMonth ?? null,
        recipientType: row!.recipientType,
        channel: row!.channel,
        config: row!.config ?? {},
        isActive: row!.isActive,
        nextDeliveryAt: row!.nextDeliveryAt ?? null,
        createdAt: row!.createdAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);

// ── Helpers ───────────────────────────────────────────────────────

function computeNextDelivery(
  frequency: string,
  deliveryHour: number,
  deliveryDayOfWeek?: number,
  deliveryDayOfMonth?: number,
): Date {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(deliveryHour);

  if (frequency === 'daily') {
    // Next occurrence of deliveryHour (today if not yet passed, otherwise tomorrow)
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (frequency === 'weekly' && deliveryDayOfWeek !== undefined) {
    // Next occurrence of the specified day of week
    const currentDow = next.getDay();
    let daysUntil = deliveryDayOfWeek - currentDow;
    if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
      daysUntil += 7;
    }
    next.setDate(next.getDate() + daysUntil);
  } else if (frequency === 'monthly' && deliveryDayOfMonth !== undefined) {
    // Next occurrence of the specified day of month
    next.setDate(deliveryDayOfMonth);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next;
}
