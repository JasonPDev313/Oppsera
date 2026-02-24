// ── Scheduled AI Report Delivery Service ──────────────────────────
// Manages recurring AI-powered report generation and delivery.
// Reports are stored in the semantic_scheduled_reports table.
// Supports daily/weekly/monthly frequencies with in_app/email/webhook
// delivery channels. V1 executes report + updates timestamps;
// actual email/webhook delivery is deferred to V2.

import { db, withTenant } from '@oppsera/db';
import { semanticScheduledReports } from '@oppsera/db';
import { sql, eq, and, desc, lte } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ReportType,
  Frequency,
  RecipientType,
  DeliveryChannel,
  ScheduledReportConfig,
} from '@oppsera/db';

// ── Types ─────────────────────────────────────────────────────────

export type ScheduledReport = InferSelectModel<typeof semanticScheduledReports>;

export interface CreateScheduleInput {
  tenantId: string;
  userId: string;
  name: string;
  reportType?: ReportType;
  frequency: Frequency;
  deliveryHour?: number;
  deliveryDayOfWeek?: number | null;
  deliveryDayOfMonth?: number | null;
  recipientType?: RecipientType;
  recipientRoleIds?: string[];
  recipientUserIds?: string[];
  channel?: DeliveryChannel;
  webhookUrl?: string | null;
  config?: ScheduledReportConfig;
}

export interface UpdateScheduleInput {
  name?: string;
  reportType?: ReportType;
  frequency?: Frequency;
  deliveryHour?: number;
  deliveryDayOfWeek?: number | null;
  deliveryDayOfMonth?: number | null;
  recipientType?: RecipientType;
  recipientRoleIds?: string[];
  recipientUserIds?: string[];
  channel?: DeliveryChannel;
  webhookUrl?: string | null;
  config?: ScheduledReportConfig;
  isActive?: boolean;
}

export interface ListSchedulesOptions {
  userId?: string;
  activeOnly?: boolean;
}

// ── Commands ──────────────────────────────────────────────────────

/** Create a new scheduled report delivery configuration. */
export async function createSchedule(input: CreateScheduleInput): Promise<ScheduledReport> {
  return withTenant(input.tenantId, async (tx) => {
    const id = generateUlid();
    const now = new Date();
    const nextDelivery = computeNextDeliveryDate(
      input.frequency,
      input.deliveryHour ?? 8,
      input.deliveryDayOfWeek ?? null,
      input.deliveryDayOfMonth ?? null,
      now,
    );

    const [row] = await tx
      .insert(semanticScheduledReports)
      .values({
        id,
        tenantId: input.tenantId,
        userId: input.userId,
        name: input.name,
        reportType: input.reportType ?? 'digest',
        frequency: input.frequency,
        deliveryHour: input.deliveryHour ?? 8,
        deliveryDayOfWeek: input.deliveryDayOfWeek ?? null,
        deliveryDayOfMonth: input.deliveryDayOfMonth ?? null,
        recipientType: input.recipientType ?? 'self',
        recipientRoleIds: input.recipientRoleIds ?? null,
        recipientUserIds: input.recipientUserIds ?? null,
        channel: input.channel ?? 'in_app',
        webhookUrl: input.webhookUrl ?? null,
        config: input.config ?? {},
        isActive: true,
        lastDeliveredAt: null,
        nextDeliveryAt: nextDelivery,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return row!;
  });
}

/** Update an existing scheduled report configuration. */
export async function updateSchedule(
  tenantId: string,
  reportId: string,
  input: UpdateScheduleInput,
): Promise<ScheduledReport | null> {
  return withTenant(tenantId, async (tx) => {
    // Build the update payload from provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updates.name = input.name;
    if (input.reportType !== undefined) updates.reportType = input.reportType;
    if (input.deliveryHour !== undefined) updates.deliveryHour = input.deliveryHour;
    if (input.deliveryDayOfWeek !== undefined) updates.deliveryDayOfWeek = input.deliveryDayOfWeek;
    if (input.deliveryDayOfMonth !== undefined) updates.deliveryDayOfMonth = input.deliveryDayOfMonth;
    if (input.recipientType !== undefined) updates.recipientType = input.recipientType;
    if (input.recipientRoleIds !== undefined) updates.recipientRoleIds = input.recipientRoleIds;
    if (input.recipientUserIds !== undefined) updates.recipientUserIds = input.recipientUserIds;
    if (input.channel !== undefined) updates.channel = input.channel;
    if (input.webhookUrl !== undefined) updates.webhookUrl = input.webhookUrl;
    if (input.config !== undefined) updates.config = input.config;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    // If frequency changes, recompute next delivery date
    if (input.frequency !== undefined) {
      updates.frequency = input.frequency;
      updates.nextDeliveryAt = computeNextDeliveryDate(
        input.frequency,
        (input.deliveryHour ?? updates.deliveryHour ?? 8) as number,
        (input.deliveryDayOfWeek !== undefined ? input.deliveryDayOfWeek : null) as number | null,
        (input.deliveryDayOfMonth !== undefined ? input.deliveryDayOfMonth : null) as number | null,
        new Date(),
      );
    }

    // Build dynamic SET clause using raw SQL (Drizzle .set() doesn't
    // support partial dynamic updates well with nullable fields)
    const setClauses = Object.entries(updates).map(([key, val]) => {
      const col = camelToSnake(key);
      return sql`${sql.raw(col)} = ${val}`;
    });

    const result = await tx.execute(sql`
      UPDATE semantic_scheduled_reports
      SET ${sql.join(setClauses, sql`, `)}
      WHERE id = ${reportId}
        AND tenant_id = ${tenantId}
      RETURNING *
    `);

    const rows = Array.from(result as Iterable<ScheduledReport>);
    return rows[0] ?? null;
  });
}

/** Soft-delete a scheduled report by deactivating it. */
export async function deleteSchedule(
  tenantId: string,
  reportId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (tx) => {
    const result = await tx.execute(sql`
      UPDATE semantic_scheduled_reports
      SET is_active = false, updated_at = NOW()
      WHERE id = ${reportId}
        AND tenant_id = ${tenantId}
      RETURNING id
    `);
    const rows = Array.from(result as Iterable<{ id: string }>);
    return rows.length > 0;
  });
}

// ── Queries ───────────────────────────────────────────────────────

/** List scheduled reports for a tenant, optionally filtered by user. */
export async function listSchedules(
  tenantId: string,
  options?: ListSchedulesOptions,
): Promise<ScheduledReport[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(semanticScheduledReports.tenantId, tenantId)];

    if (options?.userId) {
      conditions.push(eq(semanticScheduledReports.userId, options.userId));
    }
    if (options?.activeOnly !== false) {
      conditions.push(eq(semanticScheduledReports.isActive, true));
    }

    return tx
      .select()
      .from(semanticScheduledReports)
      .where(and(...conditions))
      .orderBy(desc(semanticScheduledReports.createdAt));
  });
}

/** Get a single scheduled report by ID. */
export async function getSchedule(
  tenantId: string,
  reportId: string,
): Promise<ScheduledReport | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(semanticScheduledReports)
      .where(
        and(
          eq(semanticScheduledReports.id, reportId),
          eq(semanticScheduledReports.tenantId, tenantId),
        ),
      );

    return rows[0] ?? null;
  });
}

/**
 * Find all active reports whose next delivery is due.
 * Runs without tenant scope — scans across all tenants.
 * Used by the background job worker to trigger delivery.
 */
export async function getSchedulesDue(limit = 50): Promise<ScheduledReport[]> {
  const rows = await db
    .select()
    .from(semanticScheduledReports)
    .where(
      and(
        eq(semanticScheduledReports.isActive, true),
        lte(semanticScheduledReports.nextDeliveryAt, sql`NOW()`),
      ),
    )
    .orderBy(semanticScheduledReports.nextDeliveryAt)
    .limit(limit);

  return rows;
}

// ── Delivery Execution ────────────────────────────────────────────

/**
 * Execute a scheduled report delivery:
 * 1. Marks the report as delivered (timestamps)
 * 2. Computes the next delivery date
 * 3. Calls the appropriate delivery handler
 *
 * V1: updates timestamps only. Actual pipeline execution and
 * channel-specific delivery (email, webhook) are deferred to V2.
 */
export async function executeScheduledDelivery(report: ScheduledReport): Promise<void> {
  const now = new Date();
  const nextDelivery = computeNextDeliveryDate(
    report.frequency as Frequency,
    report.deliveryHour,
    report.deliveryDayOfWeek,
    report.deliveryDayOfMonth,
    now,
  );

  await withTenant(report.tenantId, async (tx) => {
    await tx
      .update(semanticScheduledReports)
      .set({
        lastDeliveredAt: now,
        nextDeliveryAt: nextDelivery,
        updatedAt: now,
      })
      .where(eq(semanticScheduledReports.id, report.id));
  });

  // V1: log execution. Full delivery (runPipeline + email/webhook) in V2.
  console.log(
    `[scheduled-delivery] Executed report "${report.name}" (${report.id}) ` +
    `via ${report.channel}, next delivery: ${nextDelivery.toISOString()}`,
  );
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Computes the next delivery date based on frequency and schedule config.
 *
 * - daily: next occurrence of deliveryHour (tomorrow if today's hour has passed)
 * - weekly: next deliveryDayOfWeek at deliveryHour (0=Sun, 1=Mon, ..., 6=Sat)
 * - monthly: next deliveryDayOfMonth at deliveryHour (1-28)
 */
function computeNextDeliveryDate(
  frequency: Frequency,
  deliveryHour: number,
  deliveryDayOfWeek: number | null,
  deliveryDayOfMonth: number | null,
  from: Date,
): Date {
  const next = new Date(from);

  switch (frequency) {
    case 'daily': {
      // Next day at the specified hour
      next.setDate(next.getDate() + 1);
      next.setHours(deliveryHour, 0, 0, 0);
      break;
    }
    case 'weekly': {
      // Next occurrence of deliveryDayOfWeek (default Monday = 1)
      const targetDay = deliveryDayOfWeek ?? 1;
      const currentDay = next.getDay();
      const daysUntilTarget = ((targetDay - currentDay + 7) % 7) || 7;
      next.setDate(next.getDate() + daysUntilTarget);
      next.setHours(deliveryHour, 0, 0, 0);
      break;
    }
    case 'monthly': {
      // 1st of next month at deliveryHour (or specified day, capped at 28)
      const targetDayOfMonth = Math.min(deliveryDayOfMonth ?? 1, 28);
      next.setMonth(next.getMonth() + 1, targetDayOfMonth);
      next.setHours(deliveryHour, 0, 0, 0);
      break;
    }
  }

  return next;
}

/** Convert camelCase key to snake_case for raw SQL column names. */
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}
