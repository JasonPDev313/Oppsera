import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpsertPerformanceTargetInput } from '../validation';

export async function upsertPerformanceTarget(
  ctx: RequestContext,
  input: UpsertPerformanceTargetInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'upsertPerformanceTarget',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    // Use raw SQL upsert with ON CONFLICT since Drizzle doesn't support it well
    // The natural key is (tenant_id, station_id, order_type) with NULLs treated as match-all
    const stationId = input.stationId ?? null;
    const orderType = input.orderType ?? null;
    const locationId = ctx.locationId ?? null;

    const id = generateUlid();

    const rows = await (tx as any).execute(
      sql`INSERT INTO fnb_kds_performance_targets (
            id, tenant_id, location_id, station_id, order_type,
            target_prep_seconds, warning_prep_seconds, critical_prep_seconds,
            speed_of_service_goal_seconds, is_active
          ) VALUES (
            ${id}, ${ctx.tenantId}, ${locationId}, ${stationId}, ${orderType},
            ${input.targetPrepSeconds}, ${input.warningPrepSeconds}, ${input.criticalPrepSeconds},
            ${input.speedOfServiceGoalSeconds ?? null}, true
          )
          ON CONFLICT (tenant_id, COALESCE(station_id, ''), COALESCE(order_type, ''))
          DO UPDATE SET
            target_prep_seconds = EXCLUDED.target_prep_seconds,
            warning_prep_seconds = EXCLUDED.warning_prep_seconds,
            critical_prep_seconds = EXCLUDED.critical_prep_seconds,
            speed_of_service_goal_seconds = EXCLUDED.speed_of_service_goal_seconds,
            location_id = EXCLUDED.location_id,
            updated_at = NOW()
          RETURNING *`,
    );

    const saved = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.kds.performance_target.upserted.v1', {
      targetId: saved.id as string,
      stationId,
      orderType,
      targetPrepSeconds: input.targetPrepSeconds,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertPerformanceTarget', saved);
    return { result: saved, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.performance_target.upserted', 'fnb_kds_performance_targets', result.id as string);
  return result;
}
