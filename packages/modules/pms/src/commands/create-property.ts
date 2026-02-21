import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ValidationError } from '@oppsera/shared';
import { pmsProperties } from '@oppsera/db';
import type { CreatePropertyInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createProperty(ctx: RequestContext, input: CreatePropertyInput) {
  // Validate timezone is non-empty (schema enforces min(1), but belt-and-suspenders)
  if (!input.timezone || input.timezone.trim().length === 0) {
    throw new ValidationError('Timezone is required', [
      { field: 'timezone', message: 'Timezone must be a non-empty string' },
    ]);
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [created] = await tx
      .insert(pmsProperties)
      .values({
        tenantId: ctx.tenantId,
        name: input.name,
        timezone: input.timezone,
        currency: input.currency ?? 'USD',
        addressJson: input.addressJson ?? null,
        taxRatePct: String(input.taxRatePct ?? 0),
        checkInTime: input.checkInTime ?? '15:00',
        checkOutTime: input.checkOutTime ?? '11:00',
        nightAuditTime: input.nightAuditTime ?? '03:00',
        createdBy: ctx.user.id,
      })
      .returning();

    await pmsAuditLogEntry(tx, ctx, created!.id, 'property', created!.id, 'created');

    const event = buildEventFromContext(ctx, PMS_EVENTS.PROPERTY_CREATED, {
      propertyId: created!.id,
      name: created!.name,
      timezone: created!.timezone,
      currency: created!.currency,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'pms.property.created', 'pms_property', result.id);

  return result;
}
