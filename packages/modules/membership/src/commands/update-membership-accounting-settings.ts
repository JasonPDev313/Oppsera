import { eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { membershipAccountingSettings } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { UpdateMembershipAccountingSettingsInput } from '../validation';

export async function updateMembershipAccountingSettings(
  ctx: RequestContext,
  input: UpdateMembershipAccountingSettingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check if settings already exist for this tenant
    const [existing] = await (tx as any)
      .select()
      .from(membershipAccountingSettings)
      .where(eq(membershipAccountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateValues[key] = value;
      }
    }

    let settings;
    if (existing) {
      [settings] = await (tx as any)
        .update(membershipAccountingSettings)
        .set(updateValues)
        .where(eq(membershipAccountingSettings.tenantId, ctx.tenantId))
        .returning();
    } else {
      [settings] = await (tx as any)
        .insert(membershipAccountingSettings)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          ...updateValues,
        })
        .returning();
    }

    const event = buildEventFromContext(ctx, 'membership.accounting_settings.updated.v1', {
      tenantId: ctx.tenantId,
      updatedFields: Object.keys(updateValues).filter((k) => k !== 'updatedAt'),
    });

    return { result: settings!, events: [event] };
  });

  await auditLog(ctx, 'membership.accounting_settings.updated', 'membership_accounting_settings', ctx.tenantId);
  return result;
}
