import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { fnbPrepNotePresets } from '@oppsera/db';
import type { RequestContext } from '@oppsera/core/auth/context';
import type { CreatePrepNotePresetInput } from '../validation';

export async function createPrepNotePreset(
  ctx: RequestContext,
  input: CreatePrepNotePresetInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const idempotencyCheck = await checkIdempotency(
      tx, ctx.tenantId, input.clientRequestId, 'createPrepNotePreset',
    );
    if (idempotencyCheck.isDuplicate) {
      return { result: idempotencyCheck.originalResult as any, events: [] };
    }

    const [created] = await (tx as any)
      .insert(fnbPrepNotePresets)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId ?? null,
        catalogItemId: input.catalogItemId ?? null,
        noteText: input.noteText,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createPrepNotePreset', created);

    return { result: created!, events: [] };
  });

  await auditLog(ctx, 'fnb.prep_note_preset.created', 'fnb_prep_note_presets', result.id);
  return result;
}
