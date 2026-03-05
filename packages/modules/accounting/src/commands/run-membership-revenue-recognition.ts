import { eq, and, lte } from 'drizzle-orm';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipDuesRecognitionSchedule, withTenant } from '@oppsera/db';
import { recognizeMembershipRevenue } from './recognize-membership-revenue';

export interface RunMembershipRevenueRecognitionInput {
  throughDate: string; // ISO YYYY-MM-DD
}

export interface MembershipRecognitionResult {
  processed: number;
  skipped: number;
  totalRecognizedCents: number;
  errors: string[];
}

/**
 * Batch command: recognize membership dues revenue for ALL active schedules
 * for a tenant through `throughDate`.
 *
 * Fetches all 'active' recognition schedule rows where billingPeriodStart <= throughDate,
 * then calls recognizeMembershipRevenue for each. Idempotency is per-schedule via
 * the unique index on (scheduleId, recognitionDate).
 *
 * Errors per schedule are captured and accumulated without stopping the batch.
 */
export async function runMembershipRevenueRecognition(
  ctx: RequestContext,
  input: RunMembershipRevenueRecognitionInput,
): Promise<MembershipRecognitionResult> {
  const schedules = await withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select({
        id: membershipDuesRecognitionSchedule.id,
        billingSourceRef: membershipDuesRecognitionSchedule.billingSourceRef,
      })
      .from(membershipDuesRecognitionSchedule)
      .where(
        and(
          eq(membershipDuesRecognitionSchedule.tenantId, ctx.tenantId),
          eq(membershipDuesRecognitionSchedule.status, 'active'),
          lte(membershipDuesRecognitionSchedule.billingPeriodStart, input.throughDate),
        ),
      );
  });

  let processed = 0;
  let skipped = 0;
  let totalRecognizedCents = 0;
  const errors: string[] = [];

  for (const schedule of schedules) {
    try {
      const result = await recognizeMembershipRevenue(ctx, {
        scheduleId: schedule.id,
        throughDate: input.throughDate,
      });

      if (result.skipped) {
        skipped++;
      } else {
        processed++;
        totalRecognizedCents += result.recognizedCents;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${schedule.billingSourceRef}: ${message}`);
    }
  }

  auditLogDeferred(
    ctx,
    'membership.dues.recognition_batch',
    'membership_dues_recognition_schedule',
    input.throughDate,
  );

  return { processed, skipped, totalRecognizedCents, errors };
}
