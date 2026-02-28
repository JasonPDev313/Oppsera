import { sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { UpsertItemPrepTimeInput, BulkUpsertItemPrepTimesInput } from '../validation';

export async function upsertItemPrepTime(
  ctx: RequestContext,
  input: UpsertItemPrepTimeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'upsertItemPrepTime',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const stationId = input.stationId ?? null;

    // Manual upsert — ON CONFLICT doesn't support COALESCE expressions directly
    const existingRows = await (tx as any).execute(
      sql`SELECT id FROM fnb_kds_item_prep_times
          WHERE tenant_id = ${ctx.tenantId}
            AND catalog_item_id = ${input.catalogItemId}
            AND COALESCE(station_id, '') = COALESCE(${stationId}, '')
            AND is_active = true
          LIMIT 1`,
    );
    const existing = Array.from(existingRows as Iterable<Record<string, unknown>>)[0];

    let rows;
    if (existing) {
      rows = await (tx as any).execute(
        sql`UPDATE fnb_kds_item_prep_times SET
              estimated_prep_seconds = ${input.estimatedPrepSeconds},
              updated_at = NOW()
            WHERE id = ${existing.id as string}
            RETURNING *`,
      );
    } else {
      rows = await (tx as any).execute(
        sql`INSERT INTO fnb_kds_item_prep_times (
              tenant_id, catalog_item_id, station_id,
              estimated_prep_seconds, is_active
            ) VALUES (
              ${ctx.tenantId}, ${input.catalogItemId}, ${stationId},
              ${input.estimatedPrepSeconds}, true
            )
            RETURNING *`,
      );
    }

    const saved = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const event = buildEventFromContext(ctx, 'fnb.kds.item_prep_time.upserted.v1', {
      prepTimeId: saved.id as string,
      catalogItemId: input.catalogItemId,
      stationId,
      estimatedPrepSeconds: input.estimatedPrepSeconds,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'upsertItemPrepTime', saved);
    return { result: saved, events: [event] };
  });

  await auditLog(ctx, 'fnb.kds.item_prep_time.upserted', 'fnb_kds_item_prep_times', result.id as string);
  return result;
}

export async function bulkUpsertItemPrepTimes(
  ctx: RequestContext,
  input: BulkUpsertItemPrepTimesInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'bulkUpsertItemPrepTimes',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const savedItems: Record<string, unknown>[] = [];

    for (const item of input.items) {
      const stationId = item.stationId ?? null;

      const existingRows = await (tx as any).execute(
        sql`SELECT id FROM fnb_kds_item_prep_times
            WHERE tenant_id = ${ctx.tenantId}
              AND catalog_item_id = ${item.catalogItemId}
              AND COALESCE(station_id, '') = COALESCE(${stationId}, '')
              AND is_active = true
            LIMIT 1`,
      );
      const existing = Array.from(existingRows as Iterable<Record<string, unknown>>)[0];

      let rows;
      if (existing) {
        rows = await (tx as any).execute(
          sql`UPDATE fnb_kds_item_prep_times SET
                estimated_prep_seconds = ${item.estimatedPrepSeconds},
                updated_at = NOW()
              WHERE id = ${existing.id as string}
              RETURNING *`,
        );
      } else {
        rows = await (tx as any).execute(
          sql`INSERT INTO fnb_kds_item_prep_times (
                tenant_id, catalog_item_id, station_id,
                estimated_prep_seconds, is_active
              ) VALUES (
                ${ctx.tenantId}, ${item.catalogItemId}, ${stationId},
                ${item.estimatedPrepSeconds}, true
              )
              RETURNING *`,
        );
      }

      const saved = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;
      savedItems.push(saved);
    }

    const events = [
      buildEventFromContext(ctx, 'fnb.kds.item_prep_times.bulk_upserted.v1', {
        count: savedItems.length,
        itemIds: savedItems.map((s) => s.id as string),
      }),
    ];

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'bulkUpsertItemPrepTimes', {
      count: savedItems.length,
      ids: savedItems.map((s) => s.id as string),
    });

    return { result: { items: savedItems, count: savedItems.length }, events };
  });

  await auditLog(ctx, 'fnb.kds.item_prep_times.bulk_upserted', 'fnb_kds_item_prep_times', `bulk:${result.count}`);
  return result;
}
